import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Validates ALL pending Twitter actions (quote tweets / comments) in batch.
 * Admin-only. Designed to be run once per day to minimize Twitter API usage.
 * Includes rate-limit-aware delays between API calls.
 */

function extractTweetId(url: string): string | null {
  const match = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/);
  return match ? match[1] : null;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: verify admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.split(" ")[1];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const twitterBearerToken = Deno.env.get("TWITTER_BEARER_TOKEN");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user identity from JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth error:", authError?.message);
      return new Response(JSON.stringify({ success: false, error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user is admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ success: false, error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!twitterBearerToken) {
      return new Response(JSON.stringify({ success: false, error: "TWITTER_BEARER_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get required hashtags from config
    const { data: config } = await supabase
      .from("twitter_social_config")
      .select("required_hashtags")
      .limit(1)
      .single();

    const requiredHashtags: string[] = config?.required_hashtags || ["#FalcoX", "#Xnova", "#ogames"];

    // Get ALL pending (unvalidated) actions with related data
    const { data: actions, error: dbError } = await supabase
      .from("twitter_actions")
      .select("*, twitter_missions(tweet_id)")
      .eq("validated", false)
      .order("created_at", { ascending: true });

    if (dbError) {
      console.error("DB error fetching actions:", dbError);
      return new Response(JSON.stringify({ success: false, error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!actions || actions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No pending actions to validate",
        validated: 0,
        failed: 0,
        skipped: 0,
        total: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pre-fetch all twitter_links for involved users (batch query to avoid N+1)
    const userIds = [...new Set(actions.map(a => a.user_id))];
    const { data: twitterLinks } = await supabase
      .from("twitter_links")
      .select("user_id, twitter_username")
      .in("user_id", userIds);

    const linkMap = new Map(
      (twitterLinks || []).map(l => [l.user_id, l.twitter_username?.toLowerCase()])
    );

    let validatedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ action_id: string; reason: string }> = [];

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];

      // Extract tweet ID from user's submitted URL
      const userTweetId = extractTweetId(action.user_tweet_url);
      if (!userTweetId) {
        failedCount++;
        errors.push({ action_id: action.id, reason: "Invalid tweet URL format" });
        continue;
      }

      // Rate limit: wait 1.2s between calls (Twitter allows ~300/15min = 1 per 3s, we use 1.2s for safety)
      if (i > 0) {
        await delay(1200);
      }

      try {
        // Call Twitter API v2 to verify the tweet
        const tweetResponse = await fetch(
          `https://api.twitter.com/2/tweets/${userTweetId}?tweet.fields=author_id,referenced_tweets,text&expansions=author_id&user.fields=username`,
          {
            headers: {
              "Authorization": `Bearer ${twitterBearerToken}`,
            },
          }
        );

        // Handle rate limiting - stop processing, return partial results
        if (tweetResponse.status === 429) {
          console.warn(`Rate limited at action ${i + 1}/${actions.length}. Stopping batch.`);
          skippedCount = actions.length - i;
          errors.push({ action_id: action.id, reason: "Rate limited - remaining actions skipped" });
          break;
        }

        if (!tweetResponse.ok) {
          failedCount++;
          errors.push({ action_id: action.id, reason: `Twitter API error: ${tweetResponse.status}` });
          continue;
        }

        const tweetData = await tweetResponse.json();

        if (!tweetData.data) {
          failedCount++;
          errors.push({ action_id: action.id, reason: "Tweet not found or deleted" });
          continue;
        }

        // Check 1: Author matches linked Twitter account
        const linkedUsername = linkMap.get(action.user_id);
        if (tweetData.includes?.users?.length > 0 && linkedUsername) {
          const tweetAuthor = tweetData.includes.users[0].username.toLowerCase();
          if (tweetAuthor !== linkedUsername) {
            failedCount++;
            errors.push({ action_id: action.id, reason: `Author mismatch: tweet by @${tweetAuthor}, linked @${linkedUsername}` });
            continue;
          }
        }

        // Check 2: Required hashtags
        const tweetText = (tweetData.data.text || "").toLowerCase();
        const missingHashtags = requiredHashtags.filter(
          (tag: string) => !tweetText.includes(tag.toLowerCase())
        );
        if (missingHashtags.length > 0) {
          failedCount++;
          errors.push({ action_id: action.id, reason: `Missing hashtags: ${missingHashtags.join(" ")}` });
          continue;
        }

        // Check 3: Correct reference type (quote/reply)
        const missionTweetId = action.twitter_missions?.tweet_id;
        if (missionTweetId) {
          const referencedTweets = tweetData.data.referenced_tweets || [];

          if (action.action_type === "quote_tweet") {
            const isQuoting = referencedTweets.some(
              (ref: { type: string; id: string }) => ref.type === "quoted" && ref.id === missionTweetId
            );
            if (!isQuoting) {
              failedCount++;
              errors.push({ action_id: action.id, reason: "Not a quote tweet of the mission tweet" });
              continue;
            }
          }

          if (action.action_type === "comment") {
            const isReply = referencedTweets.some(
              (ref: { type: string; id: string }) => ref.type === "replied_to" && ref.id === missionTweetId
            );
            if (!isReply) {
              failedCount++;
              errors.push({ action_id: action.id, reason: "Not a reply to the mission tweet" });
              continue;
            }
          }
        }

        // All checks passed — mark as validated
        const { error: updateError } = await supabase
          .from("twitter_actions")
          .update({ validated: true })
          .eq("id", action.id);

        if (updateError) {
          failedCount++;
          errors.push({ action_id: action.id, reason: "DB update error" });
          continue;
        }

        validatedCount++;
        console.log(`✅ Validated action ${action.id} (${action.action_type}) - ${i + 1}/${actions.length}`);

      } catch (fetchError) {
        failedCount++;
        errors.push({ action_id: action.id, reason: `Network error: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` });
        continue;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      validated: validatedCount,
      failed: failedCount,
      skipped: skippedCount,
      total: actions.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message: `Batch complete: ${validatedCount} validated, ${failedCount} failed, ${skippedCount} skipped out of ${actions.length} total`,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Batch validation error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
