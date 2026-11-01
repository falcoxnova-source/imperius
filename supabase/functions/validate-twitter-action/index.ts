import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Validate a Twitter action (quote tweet or comment) via Twitter API v2.
 * 
 * Expected body:
 * {
 *   action_id: string (uuid of the twitter_actions row)
 * }
 * 
 * This function:
 * 1. Gets the action record
 * 2. Extracts the tweet ID from the user_tweet_url
 * 3. Calls Twitter API v2 to verify the tweet exists
 * 4. Marks the action as validated
 */

function extractTweetId(url: string): string | null {
  // Handle URLs like:
  // https://twitter.com/user/status/1234567890
  // https://x.com/user/status/1234567890
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const twitterBearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    if (!twitterBearerToken) {
      console.error("TWITTER_BEARER_TOKEN not configured");
      return new Response(JSON.stringify({ success: false, error: "Twitter API not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: get user from Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action_id } = body;

    if (!action_id) {
      return new Response(JSON.stringify({ success: false, error: "action_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the action record
    const { data: action, error: actionError } = await supabase
      .from("twitter_actions")
      .select("*, twitter_missions(*)")
      .eq("id", action_id)
      .eq("user_id", user.id)
      .single();

    if (actionError || !action) {
      return new Response(JSON.stringify({ success: false, error: "Action not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action.validated) {
      return new Response(JSON.stringify({ 
        success: true, 
        already_validated: true,
        message: "Action already validated" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract tweet ID from user's tweet URL
    const userTweetId = extractTweetId(action.user_tweet_url);
    if (!userTweetId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Invalid tweet URL format" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call Twitter API v2 to verify the tweet exists
    const tweetResponse = await fetch(
      `https://api.twitter.com/2/tweets/${userTweetId}?tweet.fields=author_id,referenced_tweets,text&expansions=author_id&user.fields=username`,
      {
        headers: {
          "Authorization": `Bearer ${twitterBearerToken}`,
        },
      }
    );

    if (!tweetResponse.ok) {
      const errorText = await tweetResponse.text();
      console.error("Twitter API error:", tweetResponse.status, errorText);

      if (tweetResponse.status === 429) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Twitter API rate limit reached. Please try again later." 
        }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ 
        success: false, 
        error: "Could not verify tweet. Please check the URL and try again." 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tweetData = await tweetResponse.json();

    if (!tweetData.data) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "Tweet not found or has been deleted" 
      }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the user's linked Twitter username
    const { data: twitterLink } = await supabase
      .from("twitter_links")
      .select("twitter_username")
      .eq("user_id", user.id)
      .single();

    // Verify the tweet author matches the linked account
    if (tweetData.includes?.users?.length > 0 && twitterLink) {
      const tweetAuthor = tweetData.includes.users[0].username.toLowerCase();
      const linkedUsername = twitterLink.twitter_username.toLowerCase();
      if (tweetAuthor !== linkedUsername) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "Tweet author does not match your linked Twitter/X account" 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Verify required hashtags (#FalcoX #Xnova #ogames)
    const { data: config } = await supabase
      .from("twitter_social_config")
      .select("required_hashtags")
      .limit(1)
      .single();

    const requiredHashtags: string[] = config?.required_hashtags || ["#FalcoX", "#Xnova", "#ogames"];
    const tweetText = (tweetData.data.text || "").toLowerCase();
    const missingHashtags = requiredHashtags.filter(
      (tag: string) => !tweetText.includes(tag.toLowerCase())
    );

    if (missingHashtags.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: `Missing required hashtags: ${missingHashtags.join(" ")}`,
        missing_hashtags: missingHashtags,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For quote tweets, verify it references the mission tweet
    if (action.action_type === "quote_tweet") {
      const referencedTweets = tweetData.data.referenced_tweets || [];
      const isQuoting = referencedTweets.some(
        (ref: { type: string; id: string }) => ref.type === "quoted" && ref.id === action.twitter_missions.tweet_id
      );
      if (!isQuoting) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "This tweet does not quote the mission tweet" 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // For comments, verify it's a reply to the mission tweet
    if (action.action_type === "comment") {
      const referencedTweets = tweetData.data.referenced_tweets || [];
      const isReply = referencedTweets.some(
        (ref: { type: string; id: string }) => ref.type === "replied_to" && ref.id === action.twitter_missions.tweet_id
      );
      if (!isReply) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "This tweet is not a reply to the mission tweet" 
        }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mark action as validated
    const { error: updateError } = await supabase
      .from("twitter_actions")
      .update({ validated: true })
      .eq("id", action_id);

    if (updateError) {
      console.error("Error updating action:", updateError);
      return new Response(JSON.stringify({ success: false, error: "Error validating action" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      validated: true,
      action_type: action.action_type,
      points_awarded: action.points_awarded,
      message: `Action validated! +${action.points_awarded} social points`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Validation error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
