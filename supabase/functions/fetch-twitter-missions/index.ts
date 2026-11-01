import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Fetch new tweets from @FalcoX_universe and auto-create missions.
 * 
 * This function is called by a pg_cron job every 5 minutes.
 * It queries Twitter API v2 for recent tweets from the official account
 * and creates a mission for each new tweet.
 */

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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get config
    const { data: config, error: configError } = await supabase
      .from("twitter_social_config")
      .select("*")
      .limit(1)
      .single();

    if (configError || !config) {
      console.error("Config not found:", configError);
      return new Response(JSON.stringify({ success: false, error: "Config not found" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-save project URL and anon key in config so cron can use them
    if (!config.supabase_project_url && supabaseUrl) {
      await supabase
        .from("twitter_social_config")
        .update({ supabase_project_url: supabaseUrl, supabase_anon_key: supabaseAnonKey })
        .eq("id", config.id);
      config.supabase_project_url = supabaseUrl;
    }

    const officialAccount = config.official_account || "FalcoX_universe";
    const lastFetchedTweetId = config.last_fetched_tweet_id;
    const defaultHashtag = config.default_hashtag || "#FalcoXUniverse";

    // Step 1: If we don't have the official_twitter_user_id, look it up
    let twitterUserId = config.official_twitter_user_id;

    if (!twitterUserId) {
      console.log(`Looking up Twitter user ID for @${officialAccount}...`);
      const userLookup = await fetch(
        `https://api.twitter.com/2/users/by/username/${officialAccount}`,
        {
          headers: { "Authorization": `Bearer ${twitterBearerToken}` },
        }
      );

      if (!userLookup.ok) {
        const errText = await userLookup.text();
        console.error("User lookup failed:", userLookup.status, errText);
        return new Response(JSON.stringify({ success: false, error: "Failed to look up Twitter user" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userData = await userLookup.json();
      if (!userData.data?.id) {
        return new Response(JSON.stringify({ success: false, error: "Twitter user not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      twitterUserId = userData.data.id;

      // Save it so we don't look it up again
      await supabase
        .from("twitter_social_config")
        .update({ official_twitter_user_id: twitterUserId })
        .eq("id", config.id);

      console.log(`Saved Twitter user ID: ${twitterUserId} for @${officialAccount}`);
    }

    // Step 2: Fetch recent tweets from the official account
    let apiUrl = `https://api.twitter.com/2/users/${twitterUserId}/tweets?tweet.fields=created_at,text&max_results=10&exclude=retweets,replies`;

    // If we have a last fetched tweet ID, only get newer tweets
    if (lastFetchedTweetId) {
      apiUrl += `&since_id=${lastFetchedTweetId}`;
    }

    console.log(`Fetching tweets from @${officialAccount} (user ${twitterUserId})...`);
    const tweetsResponse = await fetch(apiUrl, {
      headers: { "Authorization": `Bearer ${twitterBearerToken}` },
    });

    if (!tweetsResponse.ok) {
      const errText = await tweetsResponse.text();
      console.error("Tweets fetch failed:", tweetsResponse.status, errText);

      if (tweetsResponse.status === 429) {
        return new Response(JSON.stringify({ success: false, error: "Rate limited" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: false, error: "Failed to fetch tweets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tweetsData = await tweetsResponse.json();
    const tweets = tweetsData.data || [];

    if (tweets.length === 0) {
      console.log("No new tweets found.");
      return new Response(JSON.stringify({ success: true, new_missions: 0, message: "No new tweets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${tweets.length} new tweets.`);

    // Step 3: Create missions for each new tweet
    let created = 0;
    let newestTweetId = lastFetchedTweetId;

    for (const tweet of tweets) {
      // Track the newest tweet ID (tweets come in reverse chronological order)
      if (!newestTweetId || BigInt(tweet.id) > BigInt(newestTweetId)) {
        newestTweetId = tweet.id;
      }

      // Check if mission already exists for this tweet
      const { data: existing } = await supabase
        .from("twitter_missions")
        .select("id")
        .eq("tweet_id", tweet.id)
        .single();

      if (existing) {
        console.log(`Mission already exists for tweet ${tweet.id}, skipping.`);
        continue;
      }

      // Build the tweet URL
      const tweetUrl = `https://x.com/${officialAccount}/status/${tweet.id}`;

      // Use the first 100 chars of the tweet as description
      const description = tweet.text.length > 100
        ? tweet.text.substring(0, 100) + "..."
        : tweet.text;

      // Insert the mission
      const { error: insertError } = await supabase
        .from("twitter_missions")
        .insert({
          tweet_id: tweet.id,
          tweet_url: tweetUrl,
          description: description,
          hashtag: defaultHashtag,
          is_active: true,
        });

      if (insertError) {
        console.error(`Error creating mission for tweet ${tweet.id}:`, insertError);
      } else {
        console.log(`Created mission for tweet ${tweet.id}: "${description}"`);
        created++;
      }
    }

    // Step 4: Update the last fetched tweet ID
    if (newestTweetId && newestTweetId !== lastFetchedTweetId) {
      await supabase
        .from("twitter_social_config")
        .update({ last_fetched_tweet_id: newestTweetId })
        .eq("id", config.id);

      console.log(`Updated last_fetched_tweet_id to ${newestTweetId}`);
    }

    return new Response(JSON.stringify({
      success: true,
      new_missions: created,
      total_tweets_checked: tweets.length,
      message: `Created ${created} new missions from ${tweets.length} tweets`
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Fetch missions error:", error);
    return new Response(JSON.stringify({ success: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
