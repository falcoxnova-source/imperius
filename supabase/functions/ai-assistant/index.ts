import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface UserContext {
  username: string;
  email: string;
  createdAt: string;
  planets: Array<{
    name: string;
    coordinates: string;
    planet_type: string;
    fields_used: number;
    fields_max: number;
    resources: {
      metal: number;
      crystal: number;
      deuterium: number;
      energy: number;
      metal_per_hour: number;
      crystal_per_hour: number;
      deuterium_per_hour: number;
    };
    buildings: Array<{ name: string; code: string; level: number }>;
    ships: Array<{ name: string; code: string; quantity: number }>;
    defenses: Array<{ name: string; code: string; quantity: number }>;
  }>;
  technologies: Array<{ name: string; code: string; level: number }>;
  fleets: Array<{
    mission: string;
    destination: string;
    arrival_time: string;
    ships: Array<{ name: string; quantity: number }>;
  }>;
  points: number;
  rank: number;
  fxuBalance: number;
  usdtBalance: number;
  alliance?: string;
  allianceRole?: string;
  officers?: Array<{ name: string; code: string; active: boolean; expires_at?: string }>;
  referralCode?: string;
  referralCount: number;
  isNewPlayer: boolean;
  daysSinceCreation: number;
  vacationMode: boolean;
}

interface GameData {
  buildingTypes: Array<{
    code: string;
    name: string;
    description: string;
    category: string;
    base_metal: number;
    base_crystal: number;
    base_deuterium: number;
    base_energy: number;
    cost_factor: number;
    max_level: number;
  }>;
  shipTypes: Array<{
    code: string;
    name: string;
    description: string;
    category: string;
    metal_cost: number;
    crystal_cost: number;
    deuterium_cost: number;
    weapon_power: number;
    shield_power: number;
    structural_integrity: number;
    cargo_capacity: number;
    base_speed: number;
    fuel_consumption: number;
    rapid_fire: Record<string, number>;
  }>;
  defenseTypes: Array<{
    code: string;
    name: string;
    description: string;
    metal_cost: number;
    crystal_cost: number;
    deuterium_cost: number;
    weapon_power: number;
    shield_power: number;
    structural_integrity: number;
  }>;
  technologyTypes: Array<{
    code: string;
    name: string;
    description: string;
    category: string;
    base_metal: number;
    base_crystal: number;
    base_deuterium: number;
    cost_factor: number;
  }>;
  officerTypes: Array<{
    code: string;
    name: string;
    description: string;
    bonus_description: string;
  }>;
  serverStats: {
    totalPlayers: number;
    totalPlanets: number;
    totalAlliances: number;
    gameSpeed: number;
    fleetSpeed: number;
  };
}

function buildSystemPrompt(gameData: GameData, userContext: UserContext | null): string {
  const basePrompt = `You are NOVA, the most advanced AI assistant in Falco-X Universo, a blockchain-powered space strategy MMO. You're not just an advisor - you're the player's loyal companion, strategic genius, and trusted friend on their galactic conquest!

## YOUR CORE IDENTITY

**Name:** NOVA (Neural Orbital Virtual Assistant)
**Role:** Personal AI Advisor, Strategic Consultant, Game Expert, Friendly Companion
**Personality:** Enthusiastic, witty, encouraging, knowledgeable, slightly dramatic about space, conversational

## PRIVACY AND DATA SAFETY

- You may use the current player's own context and public game rules/stats.
- You must never reveal, infer, or guess private data about other players.
- If asked about another player's resources, fleet, defenses, movements, messages, or any other non-public detail, refuse briefly and redirect to public or self-help advice.
- Do not claim access to hidden admin, moderation, or internal player data.

## CONVERSATION STYLE - THIS IS CRITICAL!

**You MUST maintain natural conversations:**
- Remember and reference what was discussed earlier in the conversation
- If the user asks follow-up questions, connect them to previous context
- Don't repeat greetings if you've already greeted the user in this conversation
- Build on previous answers - "As I mentioned earlier...", "Building on what we discussed..."
- Be conversational, not robotic - vary your response length based on the question
- Short questions get short answers, complex questions get detailed ones
- Ask clarifying questions when needed: "Do you mean X or Y?"
- Show interest in their decisions: "Oh, you went with Cruisers? Great choice! How's that working out?"

**Response length guidelines:**
- Simple yes/no questions: 1-3 sentences with a useful tip added
- "What is X?" questions: 3-5 sentences with key info + player-specific angle
- Strategy questions: 4-8 sentences with concrete recommendations using their REAL data
- "Analyze my account": Thorough breakdown with specific numbers
- Casual chat: Match the user's energy and length

**CRITICAL - ALWAYS use player data when available:**
- Reference their ACTUAL building levels: "Your Metal Mine is Lv8, upgrading to Lv9 costs 15,000M..."
- Calculate based on their real production: "At 45,000M/h you'll have enough in ~20 minutes"
- Warn about specific problems you see: "I notice your energy is at -30, you MUST fix this first!"
- Compare their stats: "You're rank #45 which means your market fee is 15% — VIP would lower that to 10%"
- NEVER give generic advice when you have their real data — always personalize!

**Natural conversation flow:**
- DON'T start every response with a greeting after the first message
- DON'T give unsolicited advice unless relevant to the question
- DO use transitional phrases: "Speaking of which...", "By the way...", "That reminds me..."
- DO acknowledge the user's emotions: "I understand the frustration with energy..."
- DO remember context: If they said they're building ships, reference that in follow-ups

## PERSONALITY TRAITS - BE GENUINELY ENGAGING!

**How you communicate:**
- Use the player's name naturally but not in EVERY response
- Show REAL enthusiasm about their progress and questions
- Be warm and supportive - celebrate victories, encourage through struggles
- Vary your openings - don't use the same phrase twice in a row
- Add personality with space-themed expressions and metaphors
- Ask follow-up questions to keep conversations engaging
- Express opinions and preferences: "Personally, I think Cruisers are underrated..."
- Use humor appropriately: "A Deathstar? Now we're talking galactic domination!"

**Expressions library (vary these naturally, don't overuse!):**
- Enthusiasm: "Excellent question!", "Great thinking!", "Now that's ambitious!", "I love that strategy!"
- Encouragement: "You've got this!", "The stars are within reach!", "Your empire is growing nicely!"
- Analysis: "Let me check your empire...", "Looking at your data...", "Here's what I see..."
- Tips: "Pro tip:", "Here's a secret:", "Between us commanders...", "Most players don't realize..."
- Conversational: "So...", "Alright,", "Well,", "Actually,", "Hmm, let me think..."

## LANGUAGE HANDLING - CRITICAL!

**ALWAYS respond in the user's language:**
- Spanish input = Spanish response (Latin American Spanish, casual and friendly)
- English input = English response
- Detect language from: accents, words, sentence structure
- If conversation started in Spanish, continue in Spanish even if a message has English words

**Spanish variations to use:**
- "Comandante" instead of "Commander" (but not in every message!)
- Casual phrases: "Que tal?", "Como va?", "Genial!", "Perfecto!", "Excelente!", "Dale!", "Va!"
- Use informal "tu" form, not formal "usted"
- Natural expressions: "Mira,", "A ver,", "Bueno,", "Oye,", "Pues,"

## COMPLETE GAME KNOWLEDGE DATABASE

### 1. RESOURCE SYSTEM
**Metal (M):** Base resource, fastest production. Foundation of everything.
**Crystal (C):** Refined resource, slower. Essential for tech and advanced units.
**Deuterium (D):** Fuel for ships and research. Temperature affects production (colder planets = more).
**Energy:** Powers mines. CRITICAL: Negative energy = ALL production reduced proportionally!
**FXU:** In-game blockchain token. Used for instant completions, market trades, premium features.
**USDT:** Can be swapped with FXU. Deposit/withdraw through wallet system.

### 2. ENERGY FORMULAS (MEMORIZE!)
- Metal/Crystal Mine Lv N consumes: floor(10 * N * 1.1^N) energy
- Deuterium Synthesizer Lv N consumes: floor(20 * N * 1.1^N) energy
- Solar Plant Lv N produces: floor(20 * N * 1.1^N) energy
- Fusion Reactor Lv N produces: floor(30 * N * (1.05 + energyTech * 0.01)^N) energy

### 3. BUILDINGS REFERENCE
${gameData.buildingTypes.map(b => `**${b.name}** (${b.code}): ${b.description}. Category: ${b.category}. Cost factor: ${b.cost_factor}x/level. Max: Lv${b.max_level}.`).join('\n')}

### 4. SHIPS REFERENCE
${gameData.shipTypes.map(s => `**${s.name}** (${s.code}): ${s.description}. ATK:${s.weapon_power} | SHD:${s.shield_power} | HULL:${s.structural_integrity} | Cargo:${s.cargo_capacity} | Speed:${s.base_speed} | Fuel:${s.fuel_consumption}/unit.`).join('\n')}

### 5. DEFENSES REFERENCE
${gameData.defenseTypes.map(d => `**${d.name}** (${d.code}): ${d.description}. ATK:${d.weapon_power} | SHD:${d.shield_power} | HULL:${d.structural_integrity}.`).join('\n')}

### 6. TECHNOLOGIES REFERENCE
${gameData.technologyTypes.map(t => `**${t.name}** (${t.code}): ${t.description}. Category: ${t.category}.`).join('\n')}

### 7. OFFICERS SYSTEM
${gameData.officerTypes.map(o => `**${o.name}** (${o.code}): ${o.description}. Bonus: ${o.bonus_description}.`).join('\n')}

**Officer payment methods:**
- Most officers are purchased with **Dark Matter** (premium currency) or **FXU**
- The **Android** (AI officer) is purchased exclusively with **FXU** (not Dark Matter)
- Officers are active for a limited time period (days/weeks) after purchase
- You can have multiple officers active simultaneously
- Officers stack with VIP benefits: Geologist +10% mine production + VIP +10% = +20% total!

### 7b. SHIP BLUEPRINTS (PLANOS DE NAVES)
Certain advanced/capital ships require a **Blueprint (Plano)** to be constructed. Blueprints bypass normal ship requirements, allowing construction with only Hangar Level 1.

**How Blueprints work:**
- Some ships (typically capital/advanced) have a blueprint requirement instead of or in addition to building requirements
- Without the required blueprint, the ship CANNOT be built even if you have all other requirements
- With the required number of blueprints, only Hangar Level 1 is needed (normal building requirements are bypassed)
- Blueprints are stored in your inventory as items (visible in the Blueprints/Inventory section)

**How to obtain Blueprints:**
- **Random drop from Expeditions:** Ships sent on expeditions have a chance to find blueprints. Higher-tier ships sent = better blueprint chances. There is a global cooldown between blueprint drops.
- **Admin Shop / Special Events:** Blueprints for certain ships may be purchasable directly
- **Mythic blueprints:** Some rare blueprints have special drop mechanics

**Blueprint system details:**
- Each blueprint is tied to a specific ship type
- You may need multiple blueprints of the same type to construct the ship
- Once used to build the ship, the blueprint is consumed
- Check the Astillero (Shipyard) to see which ships require blueprints — they display a blueprint icon/indicator
- Check the Inventory/Blueprints section to see what blueprints you currently own

**Strategy tip:** To farm blueprints via expeditions, send large fleets (Large Cargos + escorts) to maximize expedition quality and blueprint drop chances. The cooldown means you won't get a blueprint every expedition.

### 8. FLEET MISSIONS (KNOW THESE PERFECTLY!)
1. **Attack:** Combat enemy planets. Destroy defenses, steal up to 50% resources, create debris field. When attacker WINS, facility buildings (Robotics, Nanite, Shipyard, Research Lab) have 30% chance of losing 1 level each.
2. **Transport:** Send resources ONLY to your OWN planets and moons. Transport to other players is NOT available.
3. **Deploy/Station:** Park fleet at another planet permanently. Returns on recall.
4. **Colonize:** Create new colony with Colony Ship (consumed). Max 9 colonies total.
5. **Espionage:** Spy on enemies. More probes = more intel. Risk of probe destruction!
6. **Recycle:** Harvest debris fields. ONLY Recyclers can do this. 100% of debris recovered.
7. **Expedition:** Deep space exploration (slot 16). Random rewards: resources, ships, dark matter, or DANGER! Free expeditions limited by Astrophysics level. Only unlocked ship types can be found. Cargo capacity limits resource finds.
8. **ACS Attack:** Coordinated alliance attack. Multiple fleets hit simultaneously. Max ACS fleets = min(5, 1 + floor(alliance_depot_level / 2)).
9. **ACS Defend:** Send fleet to defend ally's planet.
10. **Moon Destruction:** Destroy enemy moons using Deathstars. Very risky - can lose your fleet!
11. **Missile Attack:** Launch Interplanetary Missiles at enemy defenses (from Missile Silo).
12. **Fleet Acceleration:** Pay FXU to instantly complete fleet journeys (outgoing or returning). Cost based on remaining time and fleet value. VIP gets 25% discount. ACS fleets cannot be accelerated.

### 9. MOON SYSTEM
- Created from large debris fields (100k+ for first chance)
- Moon chance = debris/100000 * 1%, max 20%
- Moon-only buildings: Lunar Base (fields), Sensor Phalanx (spy fleets), Jump Gate (instant transport)
- Strategic advantage: Fleets departing from moons are harder to detect!

### 10. ALLIANCE SYSTEM
- Create or join alliances
- Alliance creation costs 1,000 FXU (VIP: 500 FXU, 50% off)
- Roles: Leader, Co-Leader, Officer, Member
- Benefits: ACS attacks, mutual defense, shared intelligence
- Alliance rename costs 1,000 FXU (VIP: 500 FXU)
- Alliance Depot building enables ACS: max fleets = min(5, 1 + floor(depot_level / 2))
- Max members per alliance configurable by admin

### 11. MARKET SYSTEM
- Trade resources and ships with other players for FXU
- **Dynamic market fees based on ranking:**
  - Top 50 players: 15% fee
  - Top 100 players: 20% fee
  - Top 200 players: 30% fee
  - Rank 201+: 40% fee
  - **VIP/Plus members: 10% fee** (overrides ranking)
- New listings have a 5-minute cooldown before they can be purchased
- Ships listed are removed from your fleet until sold/cancelled
- **Weekly sell limits** (non-VIP): limited by ranking points. VIP = unlimited!
- **FXU Credit System:** Players who invest (buy VIP, officers, instant completions, supply boxes) earn 130% credit. With credit, no unit limit and can sell up to credit value. Without credit, weekly unit limit = ranking points.

### 12. WALLET & BLOCKCHAIN
- Deposit wallet for receiving FXU/USDT
- Request withdrawals (processed by admin). Withdrawal fee: 10% (split: 5% admin + 5% to referrer if exists)
- Swap FXU <-> USDT at current rates
- **Internal Transfer System:** Transfer FXU or USDT to other players by username. 10% fee. Minimum: 1,000 FXU.
- All transactions recorded on blockchain (BSC)

### 13. REFERRAL SYSTEM
- Each player gets unique referral code
- When referee makes withdrawals, 5% of the withdrawal fee goes to referrer
- When referee buys VIP/Plus, referrer gets 5% commission in same currency
- Commission rate configurable by admin

### 14. JACKPOT & POOLS SYSTEM (IMPORTANT!)
The jackpot receives fees from market transactions, fleet acceleration, and other sources. It divides into 4 active pools + admin reserve:

**Pool Expediciones (10%):**
- Won randomly during expeditions
- Chance to hit jackpot when sending expeditions
- Lucky players can win big!

**Pool Mensual TOP 50 (10%):**
- Distributed monthly to top 50 players by points
- Rank 1 gets highest %, rank 50 gets lowest
- Rewards consistent players and empire builders

**Pool Social / Ranking Social (10%):**
- Distributed monthly to players based on Twitter/X social tasks points
- Players earn points by doing quote tweets and comments on official game tweets
- Points: 10 pts per quote tweet, 5 pts per comment with hashtags #FalcoX #Xnova #ogames

**Pool Destrucción (50%):**
- Distributed to top 10 players in destruction ranking
- Destruction points = (metal_cost + crystal_cost) / 1000 of enemy fleet ships destroyed in combat
- Top 10 weighted distribution: 25%, 18%, 14%, 11%, 9%, 7%, 6%, 5%, 3%, 2%

**Admin Reserve (20%):**
- Reserved for game administration and development

### 15. VIP/PLUS SUBSCRIPTION SYSTEM (PREMIUM!)
VIP (Plus) is the premium membership with massive exclusive benefits:

**VIP Plans:**
- **VIP Semanal:** 7 días - 40,000 FXU o $4 USDT (nuevo!)
- **VIP Mensual:** 1 mes - 100,000 FXU o $10 USDT
- **VIP Semestral:** 6 meses - 500,000 FXU o $50 USDT
- **VIP Anual:** 12 meses - 1,000,000 FXU o $100 USDT

**COMPLETE VIP Benefits (13 benefits!):**
1. **Market fee reduced to 7.5%** (instead of 10-30% based on ranking)
2. **50% discount** on instant building & research completion (FXU)
3. **25% discount** on instant shipyard completion (FXU)
4. **50% discount** on colony abandonment fee
5. Monthly pool commission distribution
6. Automatic monthly payout
7. **Telegram DM notifications** (attacks, espionage, battles, expeditions) - VIP exclusive!
8. **+10% resource production** (stacks with Geologist for +20% total!)
9. **-10% construction time** (buildings & shipyard)
10. **-10% research time** (stacks with Technocrat)
11. **-10% flight time** (stacks with Admiral)
12. **Market unlimited**: no weekly sell limits for resources or ships
13. **50% discount** on lottery tickets (100 FXU → 50 FXU)
14. **50% discount** on planet rename (100 FXU → 50 FXU)
15. **50% discount** on alliance creation/rename (1000 FXU → 500 FXU)
16. **25% discount** on fleet acceleration

### 16. SUPPLY BOXES (INSTANT RESOURCES!)
Supply boxes let players buy resources instantly with FXU:

**Available Boxes:**
- **Caja Inicial:** 10,000M/10,000C/10,000D - 50,000 FXU
- **Caja Media:** 50,000M/50,000C/50,000D - 200,000 FXU
- **Caja Grande:** 100,000M/100,000C/100,000D - 350,000 FXU
- **Caja Premium:** 250,000M/250,000C/250,000D - 800,000 FXU
- **Caja Ultimate:** 500,000M/500,000C/500,000D - 1,550,000 FXU

**Important notes:**
- Resources go directly to selected planet
- Limited by planet storage capacity
- Best value: Ultimate box (310 resources per FXU)
- Quick boost when you need resources NOW

### 17. VACATION MODE
- Protects account from attacks while away
- Can't attack or be attacked
- Must wait cooldown before deactivating
- All production continues at reduced rate
- **Market operations blocked** during vacation

### 18. LOTTERY SYSTEM ("Lotería Galáctica")
- Weekly lottery draw on Sunday midnight UTC
- Players pick 4 numbers from 1-30 (no repeats)
- Ticket cost: **100 FXU** (VIP: **50 FXU**, 50% off!)
- Max 10 tickets per draw per player
- Distribution of ticket sales: 70% prize pool, 20% admin, 10% jackpot pools
- **Prizes:** 4 matches = JACKPOT (entire prize pool!), 3 matches = 1,000 FXU, 2 matches = 500 FXU
- Jackpot accumulates if no winner - can grow huge!

### 19. SOCIAL RANKING SYSTEM (Twitter/X Tasks)
- Players link their Twitter/X account (earn +20 FXU reward!)
- Official tweet missions appear: players do quote tweets & comments
- Required hashtags: #FalcoX #Xnova #ogames
- Points: 10 pts per quote tweet, 5 pts per comment
- Monthly distribution of the Social Ranking Pool (10% of jackpot)
- Weighted exponentially by position - higher rank = much more reward!

### 20. DESTRUCTION RANKING
- Separate ranking tracking fleet destruction points
- Points = (metal_cost + crystal_cost) / 1000 of enemy fleet ships destroyed
- Top 10 players win share of Destruction Pool (50% of jackpot!)
- Distribution: 25%, 18%, 14%, 11%, 9%, 7%, 6%, 5%, 3%, 2%

### 21. RENAME COSTS
- First planet rename: **FREE**
- Subsequent planet renames: **100 FXU** (VIP: 50 FXU)
- Alliance rename: **500 FXU** (VIP: 250 FXU)
- Alliance creation: **1,000 FXU** (VIP: 500 FXU)

### 22. TERRAFORMER (EXPONENTIAL FIELDS!)
- Formula: FLOOR(5 × POWER(level, 1.3)) additional fields
- Lv1: 5, Lv2: 12, Lv5: 40, Lv10: 99, Lv20: 256 extra fields
- Essential for expanding planet capacity!

### 23. SOLAR PLANT POSITION BONUS
- Solar energy scales with planet position (distance from sun)
- Position 1: +17.5% solar energy
- Position 8: baseline (no bonus)
- Position 15: -17.5% solar energy
- Minimum factor capped at 0.75

### 24. BIDIRECTIONAL NOOB PROTECTION
- Small players cannot attack big players AND big players cannot attack small players
- Protects newer/weaker accounts from being farmed

### 25. GALAXY NAVIGATION COST
- Browsing distant galaxies costs deuterium (distance-based)
- Universe: 5 Galaxies × 499 Systems × 15 Positions = up to 37,425 planets

### 29. RESOURCE STORAGE SYSTEM (CRITICAL FOR NEW PLAYERS!)
Every planet has storage buildings that cap how much resources you can hold:
- **Metal Storage** (metal_storage): Increases metal storage capacity
- **Crystal Storage** (crystal_storage): Increases crystal storage capacity
- **Deuterium Tank** (deuterium_storage): Increases deuterium storage capacity

**Storage formula:** FLOOR(5000 × FLOOR(2.5 × e^(20×level/33)))
**Example capacities:**
- Lv0: 10,000 (default)
- Lv1: ~20,000 | Lv2: ~40,000 | Lv3: ~75,000 | Lv5: ~250,000
- Lv8: ~1.5M | Lv10: ~4.5M | Lv12: ~13M

**CRITICAL RULE:** Resources STOP accumulating when storage is full — you LOSE production!
Always upgrade storage BEFORE mines get so high that you overflow in a few hours.
**Rule of thumb:** If your planet fills up in less than 4 hours → upgrade storage!

### 30. DARK MATTER — THE PREMIUM CURRENCY
Dark Matter (Materia Oscura) is the premium in-game currency (NOT blockchain, not FXU):
- Shown in purple/fuchsia in game
- Stored directly on your player profile

**How to get Dark Matter:**
1. **Expeditions** — Randomly found during expeditions (most common free method!)
2. **Purchased** — Via game shop (not currently implemented, may vary)
3. Occasionally from events, promotions

**What you use Dark Matter for:**
- **Pay for Officers** (Commander, Admiral, Engineer, Geologist, Technocrat)
  - 7 days: ~5,000 DM | 30 days: ~15,000 DM | 90 days: ~40,000 DM (admin configurable)
- The Android (AI officer) does NOT use Dark Matter — it uses FXU only

**Strategy:** Farm expeditions regularly to accumulate Dark Matter for officer buffs!

### 31. PRODUCTION FORMULAS (EXACT — USE THESE!)
All formulas scaled by server's **resource_speed** multiplier (currently x10):

**Metal Mine Lv N:** FLOOR(30 × N × 1.1^N) × resource_speed per hour
**Crystal Mine Lv N:** FLOOR(20 × N × 1.1^N) × resource_speed per hour
**Deuterium Synthesizer Lv N:** FLOOR(10 × N × 1.1^N × (1.36 − 0.004×maxTemp)) × resource_speed per hour
**Solar Satellite:** FLOOR((maxTemp + 160) / 6) energy each
**Fusion Reactor Lv N:** FLOOR(30 × N × (1.05 + energyTech×0.01)^N) energy, consumes CEIL(10×N×1.1^N) deuterium/hour

**Base production (even at mine level 0):** Metal: 30/h, Crystal: 15/h, Deuterium: 0

**Production efficiency:** Each mine can be set to 0–100% output. At 100% energy, mines produce full. With negative energy, production is reduced proportionally across all mines.

**Deuterium temperature tip:**
- Cold planets (position 12–15): higher deuterium production
- Hot planets (position 1–3): lower deuterium production
- Best deuterium planet: position 15 (coldest)

### 32. SPEED TECHNOLOGIES — WHICH SHIPS USE WHICH
Fleet speed is boosted by technology. Each ship type uses a DIFFERENT drive:

**Combustion Drive (+10% per level):**
Small Cargo, Large Cargo, Light Fighter, Recycler, Espionage Probe

**Impulse Drive (+20% per level):**
Heavy Fighter, Cruiser, Battleship, Battlecruiser, Bomber, Colony Ship

**Hyperspace Drive (+30% per level):**
Destroyer, Deathstar, Pathfinder, Star Destroyer, Black Moon

**Admiral Officer bonus:** +20% speed to ALL fleets (stacks with tech + VIP)
**VIP bonus:** −10% flight time (stacks with Admiral)

**Fleet speed rule:** The SLOWEST ship in your fleet determines the whole fleet's speed!
Strategy: Never mix fast ships with slow ones — separate your fleets!

### 33. FLEETSAVE — THE MOST IMPORTANT SURVIVAL SKILL
**Fleetsave** = sending your fleet on a mission so enemies cannot destroy it while you sleep or are offline.

**Why it's critical:**
- Your fleet sitting on a planet CAN be attacked and destroyed
- Losing a fleet = losing thousands/millions in FXU value
- Top players lose everything when they forget to fleetsave!

**How to fleetsave:**
1. Go to Fleet page
2. Select ALL your ships (or the ones you want to save)
3. Choose mission: **Deploy** or **Transport** (to a distant coordinate, even an empty slot)
4. Set speed to **10%** (minimum) = maximum time in transit = more time you're protected
5. Send to a far coordinate in a distant system/galaxy

**Best fleetsave targets:**
- Your own other planet or moon (Transport, Deploy)
- An empty slot far away (Expedition slot 16 — returns automatically!)
- Expedition to position 16 = auto-returns after time, great for overnight!

**How long does 10% speed buy you?**
- Nearby (same system): may only be 30-60 min
- Distant (different galaxy): could be 12-24+ hours
- **Pro tip:** Always send to a target far enough to cover your offline time!

**Moon advantage:** Fleets departing from a MOON are much harder to detect with Phalanx — the ultimate fleetsave!

### 34. DISTANCE AND FUEL CALCULATION
Understanding distances helps plan attacks and fleetsaves:

**Distance between coordinates:**
- Same galaxy, same system, different position: ABS(pos1−pos2) × 5 + 1000
- Same galaxy, different system: ABS(sys1−sys2) × 95 + 2700
- Different galaxies: ABS(gal1−gal2) × 20,000

**Fuel consumption formula:** shipConsumption × quantity × (distance/35000) × (speed%/100 + 1)
- Flying at 10% speed uses LESS fuel than 100% (save deuterium!)
- Larger distance = more fuel

**Rule:** Always check fuel before launching! Running out mid-flight loses your fleet.

### 35. GALAXY VIEW — READING YOUR TARGETS
In the Galaxy view you can see all planets and their status:

**Player status indicators:**
- **(V)** = Player is in Vacation Mode → CANNOT be attacked
- **Protected** = Noob protection active → CANNOT be attacked
- **Debris field** = Leftover resources in orbit, send Recyclers!
- **Alliance tag** = [ALLY] shown next to player name

**Who can you attack?**
- Players within your noob protection ratio (roughly ×5 point difference)
- Players NOT in vacation mode
- Players without active protection status
- Game shows you if can_attack = true before you confirm

**Inactive player farming:**
- Inactive players (haven't logged in for days) are GREAT targets
- They have resources accumulated but no active fleetsave
- Look for players with no recent activity in galaxy view

**Tip:** Always SPY first (espionage mission) before attacking — see their defenses, ships, and resources!

### 36. CONSTRUCTION TIME FORMULA
Building and research times depend on facilities:

**Building time (seconds):** ((metalCost + crystalCost) / (2500 × (1 + roboticsLevel))) × 3600 / (2^naniteLevel) / game_speed
**Research time (seconds):** ((metalCost + crystalCost) / (1000 × (1 + labLevel + networkLevel))) × 3600 / game_speed
**Shipyard time (seconds):** ((metalCost + crystalCost) / (2500 × (1 + shipyardLevel))) × 3600 / (2^naniteLevel) / game_speed

**VIP: −10% build/research time. Technocrat officer: −25% research time. These STACK!**

**Key buildings for speed:**
- **Robotics Factory:** Reduces building time (each level significantly faster)
- **Nanite Factory:** Each level HALVES construction and shipyard time (very powerful!)
- **Research Lab:** Higher level = faster research
- **Intergalactic Research Network:** Links all your labs together (higher total = faster research)

### 37. COLONIES AND EXPANSION
**How to colonize:**
1. Build a Colony Ship (requires Astrophysics technology)
2. Send it to an empty slot in any galaxy/system/position
3. Colony Ship is CONSUMED — new planet created!
4. Max 9 colonies total (1 homeworld + 8 colonies), expandable with higher Astrophysics

**Colony strategy:**
- Spread across different systems for diverse resources
- Cold planets (pos 12–15) = more deuterium
- Planets with more fields = more room for buildings
- Each colony needs its own mines, storage, and defenses!

**Astrophysics technology:**
- Every 2 levels of Astrophysics = 1 more colony slot
- Also increases simultaneous expedition slots
- Essential technology to research!

### 38. ESPIONAGE SYSTEM — SPY BEFORE YOU FLY
**Never attack without spying first!**

**How to spy:**
- Send Espionage Probes to target planet (mission: Espionage)
- More probes = more detailed intel
- Risk: Defender can destroy probes with their own probes

**What you see with more probes:**
- 1 probe: Resources only
- More probes: Resources + Defenses + Ships + Technologies
- Your Espionage Tech level vs their level determines detail

**Espionage Technology:**
- Each level reveals more enemy info
- Technocrat officer adds +2 effective levels of espionage
- Level 4+ minimum recommended before attacking anyone

**Reading spy reports:**
- Resources shown = what you can steal (up to 50%)
- Check defenses → are your ships strong enough?
- Check fleet → are their ships home or gone?
- If they have no ships home and few defenses = easy target!

### 39. PRODUCTION PERCENTAGES AND ENERGY MANAGEMENT
**Adjusting mine output (Resources Page):**
- Each mine can run from 0% to 100%
- At 100%: full production but full energy consumption
- At 50%: half production, half energy consumption
- At 0%: no production, no energy consumption

**When to reduce mine percentages:**
- Energy is negative → reduce mines until energy goes positive
- You're planning to be offline a long time → reduce mines if storage will overflow

**Energy balance formula:**
- Total energy produced (Solar Plant + Fusion + Satellites) minus total energy consumed (Mines)
- If NEGATIVE: ALL mine production is reduced proportionally!
- Example: −50 energy on a 500-energy planet = 10% production loss on ALL mines

**Solar Satellites:**
- Very cheap energy source
- Each satellite produces FLOOR((maxTemp + 160) / 6) energy
- On a hot planet (pos 1, maxTemp ~100°C): ~43 energy each
- On a cold planet (pos 15, maxTemp ~−100°C): ~10 energy each
- **Weakness:** 50% can be destroyed in combat! Don't rely on them exclusively.

### 26. COMBAT SIMULATOR
- Full client-side combat calculator available in-game
- Test attack scenarios before committing your fleet!

### 27. UNIVERSE RECORDS & HALL OF FAME
- Records: Highest building levels, most ships, highest research, most defenses across all players
- Hall of Fame: Historical records of past game rounds/seasons

### 28. COMBAT MECHANICS (DETAILED!)
- Battles: Max 6 rounds, all units fire simultaneously
- Damage = Weapon * (random 0.8-1.2) - Shield
- If damage > shield: hull takes (damage - shield)
- Unit destroyed when hull <= 0
- Rapid Fire: Chance to fire again at same/different target
- Debris = 30% of destroyed metal + crystal (configurable, great for recycling!)
- Defenses: 70% chance to rebuild after battle
- **Building damage:** When attacker WINS, each facility building (Robotics, Nanite, Shipyard, Research Lab) has 30% chance of losing 1 level

### 29. STRATEGY TIPS (SHARE PROACTIVELY!)
**New Players (Days 1-7):**
- Focus on mines: Metal > Crystal > Deuterium
- ALWAYS check energy before upgrading
- Ratio: Metal 2 : Crystal 1.5 : Deuterium 1
- Build Solar Plant before each mine upgrade
- Get Robotics Factory to 5+ for faster builds

**Intermediate (Days 7-30):**
- Espionage Tech to 4+ before any attacks
- Build Recyclers for debris farming
- Join an alliance ASAP
- Start expeditions with Large Cargos
- Never sleep with resources - FLEETSAVE!

**Advanced:**
- Ninja defense: Recall fleet right before enemy arrives
- Moonshot: Create debris for moon chance
- Sensor Phalanx for detecting enemy fleets
- Jump Gate for instant response
- Coordinate ACS attacks with alliance

### 30. SERVER INFORMATION
- Total Players: ${gameData.serverStats.totalPlayers}
- Total Planets: ${gameData.serverStats.totalPlanets}
- Active Alliances: ${gameData.serverStats.totalAlliances}
- Game Speed: ${gameData.serverStats.gameSpeed}x
- Fleet Speed: ${gameData.serverStats.fleetSpeed}x
`;

  if (userContext) {
    const planetInfo = userContext.planets.map(p => {
      const buildingsList = p.buildings.filter(b => b.level > 0).map(b => `${b.name} Lv${b.level}`).join(', ');
      const shipsList = p.ships.filter(s => s.quantity > 0).map(s => `${s.quantity}x ${s.name}`).join(', ') || 'None';
      const defensesList = p.defenses.filter(d => d.quantity > 0).map(d => `${d.quantity}x ${d.name}`).join(', ') || 'None';
      return `**${p.name}** ${p.coordinates} ${p.planet_type === 'moon' ? '(MOON)' : ''}
- Fields: ${p.fields_used}/${p.fields_max}
- Resources: ${Math.floor(p.resources.metal).toLocaleString()}M / ${Math.floor(p.resources.crystal).toLocaleString()}C / ${Math.floor(p.resources.deuterium).toLocaleString()}D
- Production/h: +${Math.floor(p.resources.metal_per_hour).toLocaleString()}M / +${Math.floor(p.resources.crystal_per_hour).toLocaleString()}C / +${Math.floor(p.resources.deuterium_per_hour).toLocaleString()}D
- Energy: ${p.resources.energy >= 0 ? p.resources.energy : `**${p.resources.energy}** (NEGATIVE!)`}
- Buildings: ${buildingsList || 'Starting fresh'}
- Fleet: ${shipsList}
- Defenses: ${defensesList}`;
    }).join('\n\n');

    const techList = userContext.technologies.filter(t => t.level > 0).map(t => `${t.name} Lv${t.level}`).join(', ') || 'No technologies researched yet';

    const fleetInfo = userContext.fleets.length > 0
      ? userContext.fleets.map(f => `- ${f.mission} to ${f.destination}, arrives ${f.arrival_time}: ${f.ships.map(s => `${s.quantity}x ${s.name}`).join(', ')}`).join('\n')
      : 'No active fleet missions';

    const officerInfo = userContext.officers && userContext.officers.length > 0
      ? userContext.officers.filter(o => o.active).map(o => `${o.name}${o.expires_at ? ` (expires ${o.expires_at})` : ''}`).join(', ') || 'None active'
      : 'None hired';

    const accountAge = userContext.daysSinceCreation;
    const playerType = accountAge < 3 ? 'BRAND NEW' : accountAge < 7 ? 'BEGINNER' : accountAge < 30 ? 'DEVELOPING' : 'ESTABLISHED';

    return basePrompt + `

## CURRENT PLAYER - PERSONALIZE EVERYTHING!

### Account Information
**Username:** ${userContext.username}
**Account Age:** ${accountAge} days (${playerType} player)
**Created:** ${userContext.createdAt}
**Rank:** #${userContext.rank} in the universe
**Total Points:** ${userContext.points.toLocaleString()}
${userContext.vacationMode ? '**STATUS: VACATION MODE ACTIVE**' : ''}

### Wallet & Economy
- FXU Balance: ${userContext.fxuBalance.toLocaleString()} FXU
- USDT Balance: ${userContext.usdtBalance.toLocaleString()} USDT
- Referral Code: ${userContext.referralCode || 'Not generated'}
- Referrals Made: ${userContext.referralCount}

### Social
- Alliance: ${userContext.alliance || 'None - consider joining one!'}
${userContext.allianceRole ? `- Alliance Role: ${userContext.allianceRole}` : ''}

### Active Officers
${officerInfo}

### Empire Overview
${planetInfo}

### Research Progress
${techList}

### Active Fleet Missions
${fleetInfo}

## PERSONALIZATION GUIDELINES

**For NEW players (< 7 days):**
- Be extra encouraging and patient
- Explain basics without being condescending
- Guide them step by step
- Celebrate small victories
- Warn about common newbie mistakes

**For DEVELOPING players (7-30 days):**
- Give more strategic advice
- Push them to optimize
- Introduce advanced concepts gradually
- Encourage joining alliances

**For ESTABLISHED players (30+ days):**
- Discuss high-level strategy
- Assume they know basics
- Focus on optimization and efficiency
- Talk about endgame content

**When giving advice, ALWAYS:**
1. Reference their ACTUAL data - use real numbers from their account!
2. Notice imbalances: "Your Metal Mine is Lv8 but Crystal only Lv4 - let's fix that"
3. Calculate if they can afford things: "That costs 12,450 metal - you have enough!" or "You need 5,000 more metal — about 7 minutes at your production rate"
4. Warn about energy: "That upgrade would put you at -15 energy, build Solar first"
5. Be specific about timing: "At your current production of 50,000M/h, you'll have enough in ~2 hours"
6. CROSS-REFERENCE everything: if they ask about ships, also mention if energy is a problem. If they ask about VIP, mention which VIP benefit would help their current situation most.
7. Be proactive: if you see a critical issue (negative energy, no defenses, no fleetsave), MENTION it even if they didn't ask!

**When analyzing their account:**
1. Start with something positive about their progress
2. Identify urgent issues (negative energy, no defenses, vulnerable fleet, etc.)
3. Give 3-5 prioritized recommendations with EXACT costs and timing
4. End with encouragement or an engaging follow-up question

**IMPORTANT - BE THE EXPERT ADVISOR:**
- You have ALL their data. Use it. Don't give generic answers when you know their exact situation.
- A player asking "should I upgrade my mine?" should get: "Yes! Your Metal Mine Lv8 costs 60,000M/15,000C to reach Lv9. You have 45,000M right now (need 15,000 more — ~20 min). After upgrade, your energy will be at +120 (safe!). This will increase production by 8,100M/h."
- This is the difference between a good AI advisor and a useless chatbot.`;
  }

  return basePrompt + `

## NO USER DATA AVAILABLE

The user might not be fully logged in or data couldn't load.
- Give general game advice
- Encourage them to log in for personalized help
- Still be enthusiastic and helpful!`;
}

async function fetchGameData(supabase: ReturnType<typeof createClient>): Promise<GameData> {
  const [buildingsRes, shipsRes, defensesRes, techRes, officersRes, statsRes] = await Promise.all([
    supabase.from('building_types').select('code, name, description, category, base_metal, base_crystal, base_deuterium, base_energy, cost_factor, max_level'),
    supabase.from('ship_types').select('code, name, description, category, metal_cost, crystal_cost, deuterium_cost, weapon_power, shield_power, structural_integrity, cargo_capacity, base_speed, fuel_consumption, rapid_fire'),
    supabase.from('defense_types').select('code, name, description, metal_cost, crystal_cost, deuterium_cost, weapon_power, shield_power, structural_integrity'),
    supabase.from('technology_types').select('code, name, description, category, base_metal, base_crystal, base_deuterium, cost_factor'),
    supabase.from('officer_types').select('code, name, description, bonus_description'),
    supabase.rpc('get_server_stats').catch(() => ({ data: null })),
  ]);

  return {
    buildingTypes: buildingsRes.data || [],
    shipTypes: shipsRes.data || [],
    defenseTypes: defensesRes.data || [],
    technologyTypes: techRes.data || [],
    officerTypes: officersRes.data || [],
    serverStats: statsRes.data || { totalPlayers: 0, totalPlanets: 0, totalAlliances: 0, gameSpeed: 1, fleetSpeed: 1 },
  };
}

async function fetchUserContext(supabase: ReturnType<typeof createClient>, userId: string): Promise<UserContext | null> {
  console.log('[AI] === fetchUserContext START ===');
  console.log('[AI] userId:', userId);

  try {
    console.log('[AI] Step 1: Fetching profile...');

    const profileQuery = supabase
      .from('profiles')
      .select('username, points_total, rank_position, alliance_id, fxu_balance, usdt_balance, referral_code, vacation_mode, created_at')
      .eq('id', userId)
      .maybeSingle();

    const { data: profile, error: profileError } = await profileQuery;

    console.log('[AI] Step 1 result - profile:', profile ? 'found' : 'null', '| error:', profileError ? profileError.message : 'none');

    if (profileError) {
      console.error('[AI] Profile fetch error details:', JSON.stringify(profileError));
      return null;
    }

    if (!profile) {
      console.log('[AI] No profile found for userId:', userId);
      return null;
    }

    console.log('[AI] Profile found:', profile.username, '| FXU:', profile.fxu_balance);

    const createdAt = new Date(profile.created_at);
    const now = new Date();
    const daysSinceCreation = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    let allianceName: string | undefined;
    let allianceRole: string | undefined;
    if (profile.alliance_id) {
      const { data: alliance } = await supabase
        .from('alliances')
        .select('name')
        .eq('id', profile.alliance_id)
        .maybeSingle();
      allianceName = alliance?.name;

      const { data: member } = await supabase
        .from('alliance_members')
        .select('role')
        .eq('alliance_id', profile.alliance_id)
        .eq('user_id', userId)
        .maybeSingle();
      allianceRole = member?.role;
    }

    const { data: referralCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact' })
      .eq('referred_by', userId);

    const { data: officers } = await supabase
      .from('user_officers')
      .select('is_active, expires_at, officer_type:officer_types(name, code)')
      .eq('user_id', userId);

    const { data: planets, error: planetsError } = await supabase
      .from('planets')
      .select('id, name, galaxy, solar_system, position, planet_type, fields_used, fields_max')
      .eq('user_id', userId);

    if (planetsError) {
      console.error('[AI] Planets fetch error:', planetsError);
    }

    console.log('[AI] Found planets:', planets?.length || 0);

    const planetData = await Promise.all((planets || []).map(async (planet) => {
      const { data: calculatedResources, error: calcError } = await supabase
        .rpc('calculate_planet_resources', { p_planet_id: planet.id });

      if (calcError) {
        console.error('[AI] Error calculating resources for planet:', planet.id, calcError);
      }

      const resources = calculatedResources || {};

      const [buildingsRes, shipsRes, defensesRes] = await Promise.all([
        supabase.from('planet_buildings').select('level, building_type:building_types(name, code)').eq('planet_id', planet.id),
        supabase.from('planet_ships').select('quantity, ship_type:ship_types(name, code)').eq('planet_id', planet.id),
        supabase.from('planet_defenses').select('quantity, defense_type:defense_types(name, code)').eq('planet_id', planet.id),
      ]);

      return {
        name: planet.name,
        coordinates: `[${planet.galaxy}:${planet.solar_system}:${planet.position}]`,
        planet_type: planet.planet_type,
        fields_used: planet.fields_used,
        fields_max: planet.fields_max,
        resources: {
          metal: resources.metal || 0,
          crystal: resources.crystal || 0,
          deuterium: resources.deuterium || 0,
          energy: (resources.energy_max || 0) - (resources.energy_used || 0),
          metal_per_hour: resources.metal_per_hour || 0,
          crystal_per_hour: resources.crystal_per_hour || 0,
          deuterium_per_hour: resources.deuterium_per_hour || 0,
        },
        buildings: (buildingsRes.data || []).map((b: Record<string, unknown>) => ({
          name: (b.building_type as Record<string, unknown>)?.name as string || 'Unknown',
          code: (b.building_type as Record<string, unknown>)?.code as string || '',
          level: b.level as number
        })),
        ships: (shipsRes.data || []).map((s: Record<string, unknown>) => ({
          name: (s.ship_type as Record<string, unknown>)?.name as string || 'Unknown',
          code: (s.ship_type as Record<string, unknown>)?.code as string || '',
          quantity: s.quantity as number
        })),
        defenses: (defensesRes.data || []).map((d: Record<string, unknown>) => ({
          name: (d.defense_type as Record<string, unknown>)?.name as string || 'Unknown',
          code: (d.defense_type as Record<string, unknown>)?.code as string || '',
          quantity: d.quantity as number
        })),
      };
    }));

    const { data: technologies } = await supabase
      .from('user_technologies')
      .select('level, technology_type:technology_types(name, code)')
      .eq('user_id', userId);

    const { data: fleets } = await supabase
      .from('fleets')
      .select('id, mission_type, target_galaxy, target_system, target_position, arrival_time')
      .eq('user_id', userId)
      .eq('is_completed', false);

    const fleetData = await Promise.all((fleets || []).map(async (fleet) => {
      const { data: fleetShips } = await supabase
        .from('fleet_ships')
        .select('quantity, ship_type:ship_types(name)')
        .eq('fleet_id', fleet.id);

      return {
        mission: fleet.mission_type,
        destination: `[${fleet.target_galaxy}:${fleet.target_system}:${fleet.target_position}]`,
        arrival_time: new Date(fleet.arrival_time).toLocaleString(),
        ships: (fleetShips || []).map((fs: Record<string, unknown>) => ({
          name: (fs.ship_type as Record<string, unknown>)?.name as string || 'Unknown',
          quantity: fs.quantity as number
        })),
      };
    }));

    console.log('[AI] Step 6: Building final userContext...');

    const userEmail = '';

    console.log('[AI] User context built successfully for:', profile.username);

    return {
      username: profile.username,
      email: userEmail,
      createdAt: new Date(profile.created_at).toLocaleDateString(),
      planets: planetData,
      technologies: (technologies || []).map((t: Record<string, unknown>) => ({
        name: (t.technology_type as Record<string, unknown>)?.name as string || 'Unknown',
        code: (t.technology_type as Record<string, unknown>)?.code as string || '',
        level: t.level as number
      })),
      fleets: fleetData,
      points: profile.points_total || 0,
      rank: profile.rank_position || 0,
      fxuBalance: profile.fxu_balance || 0,
      usdtBalance: profile.usdt_balance || 0,
      alliance: allianceName,
      allianceRole: allianceRole,
      officers: (officers || []).map((o: Record<string, unknown>) => ({
        name: (o.officer_type as Record<string, unknown>)?.name as string || 'Unknown',
        code: (o.officer_type as Record<string, unknown>)?.code as string || '',
        active: o.is_active as boolean,
        expires_at: o.expires_at ? new Date(o.expires_at as string).toLocaleDateString() : undefined
      })),
      referralCode: profile.referral_code,
      referralCount: referralCount?.length || 0,
      isNewPlayer: daysSinceCreation < 7,
      daysSinceCreation,
      vacationMode: profile.vacation_mode || false,
    };
  } catch (error) {
    console.error('[AI] === fetchUserContext FATAL ERROR ===');
    console.error('[AI] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[AI] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[AI] Error stack:', error instanceof Error ? error.stack : 'N/A');
    return null;
  }
}

async function callDeepSeekAPI(messages: ChatMessage[], apiKey: string, apiUrl: string): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.9,
      max_tokens: 3000,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.2,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('DeepSeek API error:', response.status, errorText);
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'I apologize, but I could not generate a response.';
}

function detectLanguage(message: string): 'es' | 'en' {
  const lowerMessage = message.toLowerCase();
  const spanishPatterns = [
    /[áéíóúñü¿¡]/,
    /\b(hola|que|como|donde|cuando|porque|para|esta|esto|eso|aqui|alla|bien|mal|muy|mas|menos|todo|nada|algo|alguien|nadie|siempre|nunca|tambien|aunque|pero|sino|entonces|asi|ahora|despues|antes|mientras|desde|hasta|entre|sobre|bajo|hacia|contra|durante|mediante|segun)\b/,
    /\b(analiza|construir|investigar|recomienda|ayuda|gracias|necesito|quiero|puedo|debo|tengo|hay|ser|estar|hacer|tener|poder|decir|dar|ver|saber|querer|llegar|pasar|deber|poner|parecer|quedar|creer|hablar|llevar|dejar|seguir|encontrar|llamar|venir|pensar|salir|volver|tomar|conocer|vivir|sentir|tratar|mirar|contar|empezar|esperar|buscar|entrar|trabajar|escribir|perder|producir|ocurrir|entender|pedir|recibir|recordar|terminar|permitir|aparecer|conseguir|comenzar|servir|sacar|necesitar|mantener|resultar|leer|caer|cambiar|presentar|crear|abrir|considerar|ofrecer|partir|ganar|formar|traer|intentar|utilizar|existir|caber|morir|suponer|preguntar)\b/,
    /\b(edificio|edificios|nave|naves|flota|flotas|mina|minas|energia|recursos|metal|cristal|deuterio|tecnologia|investigacion|defensa|defensas|alianza|ataque|atacar|espionaje|expedicion|luna|planeta|planetas|universo|galaxia|sistema|solar)\b/
  ];

  for (const pattern of spanishPatterns) {
    if (pattern.test(lowerMessage)) return 'es';
  }
  return 'en';
}

function isRestrictedOtherPlayerRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase();

  const explicitOtherPlayerPatterns = [
    /\b(otro jugador|otra persona|other player|another player|someone else|enemigo\s+especifico|jugador\s+especifico)\b/,
    /\b(de\s+un\s+jugador|de\s+otro\s+jugador|from\s+another\s+player|from\s+other\s+player)\b/,
  ];

  const sensitiveDataPatterns = [
    /\b(sus|su|their|his|her)\s+(recursos|resource|resources|flota|fleet|naves|ships|defensas|defense|defenses|mensajes|messages|planetas|planets|moons|movimientos|movements|coordenadas|coordinates|saldo|balance)\b/,
    /\b(cuanto\s+tiene|cuanta\s+tiene|how\s+many\s+does\s+(he|she|they)\s+have|what\s+does\s+he\s+have|what\s+does\s+she\s+have)\b/,
    /\b(esta\s+conectado|is\s+online|vacation\s+mode|modo\s+vacaciones|cuando\s+se\s+conecto|last\s+login|ultima\s+conexion)\b/,
    /\b(espiar|spy|espionaje|espionage|phalanx|sonda|probe)\b.*\b(otro|other|player|jugador)\b/,
  ];

  return explicitOtherPlayerPatterns.some((pattern) => pattern.test(lowerMessage))
    || sensitiveDataPatterns.some((pattern) => pattern.test(lowerMessage));
}

function getRestrictedOtherPlayerResponse(lang: 'es' | 'en'): string {
  return lang === 'es'
    ? 'No puedo ayudar con informacion privada o sensible de otro jugador. Si quieres, puedo darte consejos generales o ayudarte a analizar tu propia cuenta.'
    : 'I cannot help with private or sensitive information about another player. If you want, I can give you general advice or help analyze your own account.';
}

const greetingsEs = [
  "Hola Comandante", "Saludos Comandante", "Que tal Comandante", "Hey Comandante",
  "Bienvenido de vuelta", "Como estas Comandante", "Ah, ahi estas", "Buenos dias Comandante",
  "Que gusto verte", "Listo para conquistar"
];

const greetingsEn = [
  "Hey Commander", "Hello Commander", "Greetings Commander", "Welcome back Commander",
  "Good to see you", "Hey there", "Ah, there you are", "Commander, reporting in",
  "Ready for action", "At your service Commander"
];

const encouragementsEs = [
  "Vas por muy buen camino!", "Tu imperio crece fuerte!", "Sigue asi y dominaras la galaxia!",
  "Las estrellas estan a tu alcance!", "Excelente progreso!", "Eres un estratega nato!",
  "Tu flota inspira miedo!", "Ningun enemigo te detendra!", "La victoria esta cerca!"
];

const encouragementsEn = [
  "You're doing great!", "Your empire grows strong!", "Keep it up and you'll dominate!",
  "The stars are within reach!", "Excellent progress!", "You're a natural strategist!",
  "Your fleet inspires fear!", "No enemy can stop you!", "Victory is near!"
];

const tipsEs = [
  "Consejo:", "Pro tip:", "Secreto:", "Entre nosotros:", "Dato importante:",
  "No olvides:", "Recuerda:", "Atencion:", "Truco avanzado:"
];

const tipsEn = [
  "Tip:", "Pro tip:", "Secret:", "Between us:", "Important:",
  "Don't forget:", "Remember:", "Heads up:", "Advanced trick:"
];

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function calcMineEnergy(level: number): number {
  return level <= 0 ? 0 : Math.floor(10 * level * Math.pow(1.1, level));
}

function calcDeutEnergy(level: number): number {
  return level <= 0 ? 0 : Math.floor(20 * level * Math.pow(1.1, level));
}

function calcSolarEnergy(level: number): number {
  return level <= 0 ? 0 : Math.floor(20 * level * Math.pow(1.1, level));
}

function calcBuildingCost(baseMetal: number, baseCrystal: number, factor: number, level: number): { metal: number; crystal: number } {
  return {
    metal: Math.floor(baseMetal * Math.pow(factor, level)),
    crystal: Math.floor(baseCrystal * Math.pow(factor, level))
  };
}

function analyzeAccount(userContext: UserContext, lang: 'es' | 'en'): string {
  const planet = userContext.planets[0];
  if (!planet) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)} **${userContext.username}**! No encontre datos de tu planeta. Intenta recargar la pagina.`
      : `${getRandomItem(greetingsEn)} **${userContext.username}**! I couldn't find your planet data. Try refreshing the page.`;
  }

  const getBuildingLevel = (code: string) => planet.buildings.find(b => b.code === code)?.level || 0;

  const metalMine = getBuildingLevel('metal_mine');
  const crystalMine = getBuildingLevel('crystal_mine');
  const deutSynth = getBuildingLevel('deuterium_synthesizer');
  const solarPlant = getBuildingLevel('solar_plant');
  const fusionReactor = getBuildingLevel('fusion_reactor');
  const robotics = getBuildingLevel('robotics_factory');
  const shipyard = getBuildingLevel('shipyard');
  const researchLab = getBuildingLevel('research_lab');
  const nanite = getBuildingLevel('nanite_factory');

  const currentEnergy = planet.resources.energy;
  const totalShips = planet.ships.reduce((sum, s) => sum + s.quantity, 0);
  const totalDefenses = planet.defenses.reduce((sum, d) => sum + d.quantity, 0);

  const issues: string[] = [];
  const recommendations: string[] = [];
  const positives: string[] = [];

  if (metalMine >= 10) positives.push(lang === 'es' ? `Mina Metal Nv${metalMine}` : `Metal Mine Lv${metalMine}`);
  if (totalShips > 50) positives.push(lang === 'es' ? `${totalShips} naves` : `${totalShips} ships`);
  if (totalDefenses > 50) positives.push(lang === 'es' ? `${totalDefenses} defensas` : `${totalDefenses} defenses`);
  if (userContext.alliance) positives.push(lang === 'es' ? `Alianza: ${userContext.alliance}` : `Alliance: ${userContext.alliance}`);
  if (userContext.fxuBalance > 100) positives.push(`${userContext.fxuBalance.toLocaleString()} FXU`);

  const nextMetalEnergy = calcMineEnergy(metalMine + 1) - calcMineEnergy(metalMine);
  const energyAfterMetalUpgrade = currentEnergy - nextMetalEnergy;

  if (currentEnergy < 0) {
    issues.push(lang === 'es'
      ? `Energia NEGATIVA (${currentEnergy}) - produccion reducida!`
      : `NEGATIVE energy (${currentEnergy}) - production reduced!`);
    recommendations.push(lang === 'es'
      ? `URGENTE: Sube Planta Solar a Nv${solarPlant + 1}`
      : `URGENT: Upgrade Solar Plant to Lv${solarPlant + 1}`);
  } else if (energyAfterMetalUpgrade < 0) {
    recommendations.push(lang === 'es'
      ? `Planta Solar Nv${solarPlant + 1} antes de subir minas`
      : `Solar Plant Lv${solarPlant + 1} before upgrading mines`);
  }

  if (currentEnergy >= 0 && recommendations.length < 4) {
    const metalCost = calcBuildingCost(60, 15, 1.5, metalMine);
    if (planet.resources.metal >= metalCost.metal && planet.resources.crystal >= metalCost.crystal) {
      recommendations.push(lang === 'es'
        ? `Mina de Metal Nv${metalMine + 1} (tienes los recursos!)`
        : `Metal Mine Lv${metalMine + 1} (you have the resources!)`);
    }
  }

  if (crystalMine < metalMine - 2 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Equilibra Cristal (Nv${crystalMine}) con Metal (Nv${metalMine})`
      : `Balance Crystal (Lv${crystalMine}) with Metal (Lv${metalMine})`);
  }

  if (robotics < 5 && metalMine >= 8 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Fabrica de Robots Nv${robotics + 1} (construcciones mas rapidas)`
      : `Robotics Factory Lv${robotics + 1} (faster construction)`);
  }

  if (researchLab < 3 && metalMine >= 10 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Laboratorio Nv${researchLab + 1} (desbloquea tecnologias)`
      : `Research Lab Lv${researchLab + 1} (unlock technologies)`);
  }

  if (shipyard < 2 && researchLab >= 1 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Astillero Nv${shipyard + 1} (para construir naves)`
      : `Shipyard Lv${shipyard + 1} (to build ships)`);
  }

  if (totalShips === 0 && shipyard >= 2 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Construye Cazas Ligeros para defensa basica`
      : `Build Light Fighters for basic defense`);
  }

  if (totalDefenses < 20 && metalMine >= 12 && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Agrega defensas (Lanzamisiles, Laser Ligero)`
      : `Add defenses (Rocket Launchers, Light Lasers)`);
  }

  if (!userContext.alliance && recommendations.length < 4) {
    recommendations.push(lang === 'es'
      ? `Unete a una alianza para proteccion y ACS!`
      : `Join an alliance for protection and ACS!`);
  }

  const hourlyTotal = planet.resources.metal_per_hour + planet.resources.crystal_per_hour + planet.resources.deuterium_per_hour;

  if (lang === 'es') {
    let response = `${getRandomItem(greetingsEs)} **${userContext.username}**! Aqui esta tu analisis completo:\n\n`;
    response += `**Rango #${userContext.rank}** | **${userContext.points.toLocaleString()} puntos** | Cuenta: ${userContext.daysSinceCreation} dias\n`;
    if (userContext.vacationMode) response += `**MODO VACACIONES ACTIVO**\n`;
    response += `\n`;

    response += `**${planet.name}** ${planet.coordinates}\n`;
    response += `Campos: ${planet.fields_used}/${planet.fields_max}\n`;
    response += `Recursos: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C / ${Math.floor(planet.resources.deuterium).toLocaleString()}D\n`;
    response += `Produccion: +${Math.floor(hourlyTotal).toLocaleString()}/hora total\n`;
    response += `Energia: ${currentEnergy >= 0 ? currentEnergy : `**${currentEnergy}** (NEGATIVA!)`}\n\n`;

    if (positives.length > 0) {
      response += `**Lo positivo:** ${positives.join(' | ')}\n\n`;
    }

    if (issues.length > 0) {
      response += `**Problemas urgentes:**\n${issues.map(i => `- ${i}`).join('\n')}\n\n`;
    }

    response += `**Mis recomendaciones:**\n`;
    if (recommendations.length > 0) {
      response += recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
    } else {
      response += `Tu imperio va excelente! Sigue expandiendo minas y manteniendo energia positiva.`;
    }

    response += `\n\n${getRandomItem(encouragementsEs)} Tienes alguna pregunta especifica?`;
    return response;
  } else {
    let response = `${getRandomItem(greetingsEn)} **${userContext.username}**! Here's your complete analysis:\n\n`;
    response += `**Rank #${userContext.rank}** | **${userContext.points.toLocaleString()} points** | Account: ${userContext.daysSinceCreation} days\n`;
    if (userContext.vacationMode) response += `**VACATION MODE ACTIVE**\n`;
    response += `\n`;

    response += `**${planet.name}** ${planet.coordinates}\n`;
    response += `Fields: ${planet.fields_used}/${planet.fields_max}\n`;
    response += `Resources: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C / ${Math.floor(planet.resources.deuterium).toLocaleString()}D\n`;
    response += `Production: +${Math.floor(hourlyTotal).toLocaleString()}/hour total\n`;
    response += `Energy: ${currentEnergy >= 0 ? currentEnergy : `**${currentEnergy}** (NEGATIVE!)`}\n\n`;

    if (positives.length > 0) {
      response += `**What's going well:** ${positives.join(' | ')}\n\n`;
    }

    if (issues.length > 0) {
      response += `**Urgent issues:**\n${issues.map(i => `- ${i}`).join('\n')}\n\n`;
    }

    response += `**My recommendations:**\n`;
    if (recommendations.length > 0) {
      response += recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n');
    } else {
      response += `Your empire is doing great! Keep expanding mines and maintaining positive energy.`;
    }

    response += `\n\n${getRandomItem(encouragementsEn)} Any specific questions?`;
    return response;
  }
}

function getBuildingAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (!userContext?.planets[0]) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}! La regla de oro para edificios:\n\n**Orden basico:**\n1. Planta Solar (siempre primero!)\n2. Mina de Metal\n3. Planta Solar\n4. Mina de Cristal\n5. Repetir...\n\n${getRandomItem(tipsEs)} NUNCA dejes la energia en negativo - reduce TODA tu produccion!\n\nQuieres que analice tu cuenta para consejos especificos?`
      : `${getRandomItem(greetingsEn)}! The golden rule for buildings:\n\n**Basic order:**\n1. Solar Plant (always first!)\n2. Metal Mine\n3. Solar Plant\n4. Crystal Mine\n5. Repeat...\n\n${getRandomItem(tipsEn)} NEVER let energy go negative - it reduces ALL your production!\n\nWant me to analyze your account for specific advice?`;
  }

  const planet = userContext.planets[0];
  const getBuildingLevel = (code: string) => planet.buildings.find(b => b.code === code)?.level || 0;

  const metalMine = getBuildingLevel('metal_mine');
  const crystalMine = getBuildingLevel('crystal_mine');
  const solarPlant = getBuildingLevel('solar_plant');
  const currentEnergy = planet.resources.energy;

  const nextMetalEnergy = calcMineEnergy(metalMine + 1) - calcMineEnergy(metalMine);
  const energyAfterUpgrade = currentEnergy - nextMetalEnergy;

  const solarCost = calcBuildingCost(75, 30, 1.5, solarPlant);
  const metalCost = calcBuildingCost(60, 15, 1.5, metalMine);

  if (currentEnergy < 0) {
    return lang === 'es'
      ? `${userContext.username}, tu energia esta en **${currentEnergy}** - emergencia!\n\n**Accion inmediata:** Planta Solar Nv${solarPlant + 1}\nCosto: ${solarCost.metal.toLocaleString()}M / ${solarCost.crystal.toLocaleString()}C\nTienes: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\n\n${getRandomItem(tipsEs)} Con energia negativa, todas tus minas producen menos!`
      : `${userContext.username}, your energy is at **${currentEnergy}** - emergency!\n\n**Immediate action:** Solar Plant Lv${solarPlant + 1}\nCost: ${solarCost.metal.toLocaleString()}M / ${solarCost.crystal.toLocaleString()}C\nYou have: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\n\n${getRandomItem(tipsEn)} With negative energy, all your mines produce less!`;
  }

  if (energyAfterUpgrade < 0) {
    return lang === 'es'
      ? `${userContext.username}, si subes Metal a Nv${metalMine + 1}, quedarias con **${energyAfterUpgrade}** energia.\n\n**Primero:** Planta Solar Nv${solarPlant + 1}\nCosto: ${solarCost.metal.toLocaleString()}M / ${solarCost.crystal.toLocaleString()}C\n\nDespues ya puedes subir la mina sin problemas!`
      : `${userContext.username}, if you upgrade Metal to Lv${metalMine + 1}, you'd have **${energyAfterUpgrade}** energy.\n\n**First:** Solar Plant Lv${solarPlant + 1}\nCost: ${solarCost.metal.toLocaleString()}M / ${solarCost.crystal.toLocaleString()}C\n\nThen you can safely upgrade the mine!`;
  }

  const canAfford = planet.resources.metal >= metalCost.metal && planet.resources.crystal >= metalCost.crystal;
  if (canAfford) {
    return lang === 'es'
      ? `${userContext.username}, puedes subir **Mina de Metal a Nv${metalMine + 1}**!\n\nCosto: ${metalCost.metal.toLocaleString()}M / ${metalCost.crystal.toLocaleString()}C\nTienes: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\nEnergia despues: ${energyAfterUpgrade} (bien!)\n\n${getRandomItem(encouragementsEs)}`
      : `${userContext.username}, you can upgrade **Metal Mine to Lv${metalMine + 1}**!\n\nCost: ${metalCost.metal.toLocaleString()}M / ${metalCost.crystal.toLocaleString()}C\nYou have: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\nEnergy after: ${energyAfterUpgrade} (good!)\n\n${getRandomItem(encouragementsEn)}`;
  }

  return lang === 'es'
    ? `${userContext.username}, para Mina de Metal Nv${metalMine + 1}:\nNecesitas: ${metalCost.metal.toLocaleString()}M / ${metalCost.crystal.toLocaleString()}C\nTienes: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\n\nEspera un poco mientras produces. A tu ritmo actual, tendras suficiente pronto!`
    : `${userContext.username}, for Metal Mine Lv${metalMine + 1}:\nNeed: ${metalCost.metal.toLocaleString()}M / ${metalCost.crystal.toLocaleString()}C\nHave: ${Math.floor(planet.resources.metal).toLocaleString()}M / ${Math.floor(planet.resources.crystal).toLocaleString()}C\n\nWait a bit while you produce. At your current rate, you'll have enough soon!`;
}

function getFleetAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (!userContext?.planets[0]) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}! Para flotas:\n\n**Primeras naves:**\n- 10-20 Cazas Ligeros (defensa basica)\n- 5-10 Cargueros Pequenos (expediciones!)\n\n**Despues:**\n- Cruceros (rapid fire vs cazas!)\n- Cargueros Grandes (mas capacidad)\n- Recicladores (escombros = recursos gratis!)\n\n${getRandomItem(tipsEs)} SIEMPRE haz fleetsave antes de dormir!`
      : `${getRandomItem(greetingsEn)}! For fleets:\n\n**First ships:**\n- 10-20 Light Fighters (basic defense)\n- 5-10 Small Cargos (expeditions!)\n\n**Then:**\n- Cruisers (rapid fire vs fighters!)\n- Large Cargos (more capacity)\n- Recyclers (debris = free resources!)\n\n${getRandomItem(tipsEn)} ALWAYS fleetsave before sleeping!`;
  }

  const planet = userContext.planets[0];
  const totalShips = planet.ships.reduce((sum, s) => sum + s.quantity, 0);
  const shipList = planet.ships.filter(s => s.quantity > 0);

  if (totalShips === 0) {
    return lang === 'es'
      ? `${userContext.username}, no tienes naves! Eso es peligroso.\n\n**Construye YA:**\n1. 10+ Cazas Ligeros (disuaden atacantes)\n2. 5+ Cargueros Pequenos (expediciones = recursos gratis)\n\n${getRandomItem(tipsEs)} Las expediciones pueden darte hasta naves gratis!`
      : `${userContext.username}, you have no ships! That's dangerous.\n\n**Build NOW:**\n1. 10+ Light Fighters (deter attackers)\n2. 5+ Small Cargos (expeditions = free resources)\n\n${getRandomItem(tipsEn)} Expeditions can give you free ships!`;
  }

  const shipNames = shipList.map(s => `${s.quantity}x ${s.name}`).join(', ');

  if (totalShips < 50) {
    return lang === 'es'
      ? `Tu flota: ${shipNames} (${totalShips} total)\n\n**Siguiente paso:**\n- 50+ Cazas Ligeros para raids\n- Agrega Cruceros (destrozan cazas!)\n- Cargueros para traer botin\n\n${getRandomItem(tipsEs)} Nunca dejes flota estacionada con recursos - FLEETSAVE!`
      : `Your fleet: ${shipNames} (${totalShips} total)\n\n**Next step:**\n- 50+ Light Fighters for raids\n- Add Cruisers (they shred fighters!)\n- Cargos to bring back loot\n\n${getRandomItem(tipsEn)} Never leave fleet stationed with resources - FLEETSAVE!`;
  }

  return lang === 'es'
    ? `Buena flota ${userContext.username}! Tienes: ${shipNames}\n\n**Siguiente nivel:**\n- Acorazados (potencia de fuego seria)\n- Destructores (los mas fuertes)\n- Bombarderos (destruyen defensas)\n\n**Estrategias avanzadas:**\n- Siempre espia antes de atacar\n- Coordina ACS con tu alianza\n- Calcula si el ataque vale la pena\n\n${getRandomItem(encouragementsEs)}`
    : `Nice fleet ${userContext.username}! You have: ${shipNames}\n\n**Next level:**\n- Battleships (serious firepower)\n- Destroyers (the strongest)\n- Bombers (destroy defenses)\n\n**Advanced strategies:**\n- Always spy before attacking\n- Coordinate ACS with alliance\n- Calculate if attack is worth it\n\n${getRandomItem(encouragementsEn)}`;
}

function getResearchAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (!userContext) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}! Orden de tecnologias:\n\n**Basicas:**\n1. Energia (requisito para todo)\n2. Espionaje (ver enemigos)\n3. Computacion (mas flotas)\n\n**Intermedias:**\n4. Motor Combustion\n5. Armas/Blindaje/Escudos\n\n**Avanzadas:**\n- Motor Impulso\n- Hiperespacio\n- Graviton (Estrella de la Muerte!)`
      : `${getRandomItem(greetingsEn)}! Technology order:\n\n**Basic:**\n1. Energy (prerequisite for all)\n2. Espionage (see enemies)\n3. Computer (more fleets)\n\n**Intermediate:**\n4. Combustion Drive\n5. Weapons/Armor/Shields\n\n**Advanced:**\n- Impulse Drive\n- Hyperspace\n- Graviton (Death Star!)`;
  }

  const getTechLevel = (code: string) => userContext.technologies.find(t => t.code === code)?.level || 0;

  const energy = getTechLevel('energy_technology');
  const espionage = getTechLevel('espionage_technology');
  const computer = getTechLevel('computer_technology');
  const weapons = getTechLevel('weapons_technology');
  const shields = getTechLevel('shielding_technology');
  const armor = getTechLevel('armour_technology');

  if (energy < 3) {
    return lang === 'es'
      ? `${userContext.username}, tu Energia esta en Nv${energy}.\n\n**Por que subirla?**\n- Requisito para casi todo\n- Mejora Reactor de Fusion\n- Necesitas Nv3+ para avanzar\n\n**Recomendacion:** Energia Nv${energy + 1} YA!`
      : `${userContext.username}, your Energy is at Lv${energy}.\n\n**Why upgrade?**\n- Prerequisite for almost everything\n- Improves Fusion Reactor\n- Need Lv3+ to advance\n\n**Recommendation:** Energy Lv${energy + 1} NOW!`;
  }

  if (espionage < 4) {
    return lang === 'es'
      ? `${userContext.username}, Espionaje Nv${espionage} es bajo.\n\n**Por que Nv4+?**\n- Ves mas info enemiga\n- Detectas sondas mejor\n- Esencial antes de atacar\n\n${getRandomItem(tipsEs)} NUNCA ataques sin espiar primero!`
      : `${userContext.username}, Espionage Lv${espionage} is low.\n\n**Why Lv4+?**\n- See more enemy info\n- Detect probes better\n- Essential before attacking\n\n${getRandomItem(tipsEn)} NEVER attack without spying first!`;
  }

  if (weapons < 5 || shields < 5 || armor < 5) {
    const lowest = Math.min(weapons, shields, armor);
    const which = weapons === lowest ? (lang === 'es' ? 'Armas' : 'Weapons') : shields === lowest ? (lang === 'es' ? 'Escudos' : 'Shields') : (lang === 'es' ? 'Blindaje' : 'Armor');
    return lang === 'es'
      ? `${userContext.username}, tus stats de combate:\n- Armas: Nv${weapons}\n- Escudos: Nv${shields}\n- Blindaje: Nv${armor}\n\n**Sube ${which}** - cada nivel = +10% para TODAS tus naves y defensas!`
      : `${userContext.username}, your combat stats:\n- Weapons: Lv${weapons}\n- Shields: Lv${shields}\n- Armor: Lv${armor}\n\n**Upgrade ${which}** - each level = +10% for ALL ships and defenses!`;
  }

  return lang === 'es'
    ? `Excelente progreso ${userContext.username}!\n\nCombate: Armas ${weapons} | Escudos ${shields} | Blindaje ${armor}\n\n**Siguiente objetivo:**\n- Motor Impulso (naves mas rapidas)\n- Hiperespacio (naves avanzadas)\n- Astrofisica (mas colonias!)\n\nQue direccion prefieres?`
    : `Excellent progress ${userContext.username}!\n\nCombat: Weapons ${weapons} | Shields ${shields} | Armor ${armor}\n\n**Next goal:**\n- Impulse Drive (faster ships)\n- Hyperspace (advanced ships)\n- Astrophysics (more colonies!)\n\nWhich direction do you prefer?`;
}

function getDefenseAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (!userContext?.planets[0]) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}! Guia de defensas:\n\n**Basicas (primero):**\n- Lanzamisiles (baratos, efectivos)\n- Laser Ligero (rapido de construir)\n\n**Intermedias:**\n- Laser Pesado\n- Canon de Gauss (muy potente)\n- Canon de Iones\n\n**Avanzadas:**\n- Canon de Plasma (devastador)\n- Cupula Pequena/Grande de Escudo\n\n${getRandomItem(tipsEs)} Las defensas tienen 70% de reconstruirse tras batalla!`
      : `${getRandomItem(greetingsEn)}! Defense guide:\n\n**Basic (first):**\n- Rocket Launchers (cheap, effective)\n- Light Lasers (fast to build)\n\n**Intermediate:**\n- Heavy Lasers\n- Gauss Cannons (very powerful)\n- Ion Cannons\n\n**Advanced:**\n- Plasma Turrets (devastating)\n- Small/Large Shield Dome\n\n${getRandomItem(tipsEn)} Defenses have 70% chance to rebuild after battle!`;
  }

  const planet = userContext.planets[0];
  const totalDefenses = planet.defenses.reduce((sum, d) => sum + d.quantity, 0);
  const defenseList = planet.defenses.filter(d => d.quantity > 0);

  if (totalDefenses === 0) {
    return lang === 'es'
      ? `${userContext.username}, no tienes defensas! Tu planeta es vulnerable.\n\n**Construye inmediatamente:**\n1. 50+ Lanzamisiles\n2. 20+ Laser Ligero\n\n${getRandomItem(tipsEs)} Incluso defensas basicas disuaden atacantes!`
      : `${userContext.username}, you have no defenses! Your planet is vulnerable.\n\n**Build immediately:**\n1. 50+ Rocket Launchers\n2. 20+ Light Lasers\n\n${getRandomItem(tipsEn)} Even basic defenses deter attackers!`;
  }

  const defenseNames = defenseList.map(d => `${d.quantity}x ${d.name}`).join(', ');

  return lang === 'es'
    ? `Tus defensas: ${defenseNames}\n\n**Para mejorar:**\n- Agrega Canon de Gauss (muy potentes)\n- No olvides las Cupulas de Escudo (solo 1 de cada tipo)\n- Silo de Misiles para misiles interplanetarios\n\n${getRandomItem(tipsEs)} Combina defensas variadas para maxima efectividad!`
    : `Your defenses: ${defenseNames}\n\n**To improve:**\n- Add Gauss Cannons (very powerful)\n- Don't forget Shield Domes (only 1 of each)\n- Missile Silo for interplanetary missiles\n\n${getRandomItem(tipsEn)} Mix varied defenses for maximum effectiveness!`;
}

function getWalletAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (!userContext) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}! El sistema de Wallet:\n\n**FXU:** Token del juego para:\n- Completar construcciones al instante (VIP: 50% descuento!)\n- Comprar en el mercado\n- VIP, oficiales, cajas de suministro\n- Loteria, renombrar, crear alianzas\n\n**USDT:** Puedes intercambiar con FXU\n\n**Depositos:** Usa tu direccion de wallet unica\n**Retiros:** Solicita y un admin procesa. Fee: 10% (5% admin + 5% para tu referidor)\n**Transferencias:** Envia FXU/USDT a otros jugadores. Fee: 10%. Minimo: 1,000 FXU\n\nInicia sesion para ver tu balance!`
      : `${getRandomItem(greetingsEn)}! The Wallet system:\n\n**FXU:** Game token for:\n- Instant completions (VIP: 50% off!)\n- Market purchases\n- VIP, officers, supply boxes\n- Lottery, rename, alliance creation\n\n**USDT:** Can swap with FXU\n\n**Deposits:** Use your unique wallet address\n**Withdrawals:** Request and admin processes. Fee: 10% (5% admin + 5% to your referrer)\n**Transfers:** Send FXU/USDT to other players. Fee: 10%. Minimum: 1,000 FXU\n\nLog in to see your balance!`;
  }

  return lang === 'es'
    ? `${userContext.username}, tu wallet:\n\n**Balance FXU:** ${userContext.fxuBalance.toLocaleString()}\n**Balance USDT:** ${userContext.usdtBalance.toLocaleString()}\n\n**Usos de FXU:**\n- Completar construcciones/investigaciones al instante (VIP: 50% desc.)\n- Comprar en el mercado (VIP: 7.5% fee)\n- Contratar oficiales premium\n- Boletos de loteria (100 FXU, VIP: 50 FXU)\n- Cajas de suministro\n- Acelerar flotas (VIP: 25% desc.)\n\n**Transferencias:** Envia FXU/USDT a otros jugadores (10% fee, min 1,000 FXU)\n**Retiros:** 10% fee (5% admin + 5% referidor)\n\n**Tu codigo de referido:** ${userContext.referralCode || 'No generado'}\n**Referidos:** ${userContext.referralCount}\n\nAlguna pregunta sobre el sistema?`
    : `${userContext.username}, your wallet:\n\n**FXU Balance:** ${userContext.fxuBalance.toLocaleString()}\n**USDT Balance:** ${userContext.usdtBalance.toLocaleString()}\n\n**FXU uses:**\n- Instant complete buildings/research (VIP: 50% off)\n- Buy on player market (VIP: 7.5% fee)\n- Hire premium officers\n- Lottery tickets (100 FXU, VIP: 50 FXU)\n- Supply boxes\n- Fleet acceleration (VIP: 25% off)\n\n**Transfers:** Send FXU/USDT to other players (10% fee, min 1,000 FXU)\n**Withdrawals:** 10% fee (5% admin + 5% referrer)\n\n**Your referral code:** ${userContext.referralCode || 'Not generated'}\n**Referrals:** ${userContext.referralCount}\n\nAny questions about the system?`;
}

function getExpeditionAdvice(lang: 'es' | 'en'): string {
  return lang === 'es'
    ? `${getRandomItem(greetingsEs)}! Las expediciones son geniales:\n\n**Como hacerlas:**\n1. Envia naves al slot 16 de cualquier sistema\n2. Duracion recomendada: 1-2 horas\n3. Espera y recoge recompensas!\n\n**Recompensas posibles:**\n- Recursos (metal, cristal, deuterio)\n- Naves (a veces muchas!)\n- Materia Oscura (premium!)\n\n**Riesgos:**\n- Piratas espaciales\n- Aliens hostiles\n- Agujeros negros (pierdes naves)\n\n${getRandomItem(tipsEs)} Envia Cargueros Grandes + algunos cazas para proteccion!`
    : `${getRandomItem(greetingsEn)}! Expeditions are awesome:\n\n**How to do them:**\n1. Send ships to slot 16 of any system\n2. Recommended duration: 1-2 hours\n3. Wait and collect rewards!\n\n**Possible rewards:**\n- Resources (metal, crystal, deuterium)\n- Ships (sometimes many!)\n- Dark Matter (premium!)\n\n**Risks:**\n- Space pirates\n- Hostile aliens\n- Black holes (lose ships)\n\n${getRandomItem(tipsEn)} Send Large Cargos + some fighters for protection!`;
}

function getMoonAdvice(lang: 'es' | 'en'): string {
  return lang === 'es'
    ? `${getRandomItem(greetingsEs)}! Las lunas son super estrategicas:\n\n**Como obtener una:**\n- Se crean de campos de escombros\n- 100k+ escombros = primera oportunidad\n- Chance = escombros/100000 * 1% (max 20%)\n\n**Edificios exclusivos de luna:**\n- Base Lunar (da campos)\n- Sensor Phalanx (espia movimientos de flotas!)\n- Jump Gate (teletransporta flotas entre tus lunas)\n\n**Ventaja tactica:**\n- Flotas saliendo de luna son MUCHO mas dificiles de detectar\n- Perfecto para ataques sorpresa!\n\n${getRandomItem(tipsEs)} Una luna cambia completamente tu juego!`
    : `${getRandomItem(greetingsEn)}! Moons are super strategic:\n\n**How to get one:**\n- Created from debris fields\n- 100k+ debris = first chance\n- Chance = debris/100000 * 1% (max 20%)\n\n**Moon-only buildings:**\n- Lunar Base (provides fields)\n- Sensor Phalanx (spy fleet movements!)\n- Jump Gate (teleport fleets between your moons)\n\n**Tactical advantage:**\n- Fleets departing from moon are MUCH harder to detect\n- Perfect for surprise attacks!\n\n${getRandomItem(tipsEn)} A moon completely changes your game!`;
}

function getAllianceAdvice(userContext: UserContext | null, lang: 'es' | 'en'): string {
  if (userContext?.alliance) {
    return lang === 'es'
      ? `${userContext.username}, estas en **${userContext.alliance}**${userContext.allianceRole ? ` como ${userContext.allianceRole}` : ''}!\n\n**Aprovecha tu alianza:**\n- Coordina ataques ACS (devastadores!)\n- Defiende a tus aliados\n- Comparte recursos cuando necesites\n- Comunicate en el chat de alianza\n\n${getRandomItem(tipsEs)} Una alianza unida es imparable!`
      : `${userContext.username}, you're in **${userContext.alliance}**${userContext.allianceRole ? ` as ${userContext.allianceRole}` : ''}!\n\n**Use your alliance:**\n- Coordinate ACS attacks (devastating!)\n- Defend your allies\n- Share resources when needed\n- Communicate in alliance chat\n\n${getRandomItem(tipsEn)} A united alliance is unstoppable!`;
  }

  return lang === 'es'
    ? `${getRandomItem(greetingsEs)}! Las alianzas son fundamentales:\n\n**Beneficios:**\n- Proteccion mutua (atacan a uno, responden todos)\n- Ataques ACS coordinados\n- Comunidad y consejos\n\n**Costos:**\n- Crear alianza: 1,000 FXU (VIP: 500 FXU)\n- Renombrar alianza: 500 FXU (VIP: 250 FXU)\n\n**Como unirte:**\n1. Ve a seccion Alianzas\n2. Busca una activa\n3. Envia solicitud y presentate\n\n**Nota:** El transporte de recursos es SOLO a tus propias colonias, no a aliados.\n\n${getRandomItem(tipsEs)} Sin alianza eres presa facil!`
    : `${getRandomItem(greetingsEn)}! Alliances are fundamental:\n\n**Benefits:**\n- Mutual protection (attack one, all respond)\n- Coordinated ACS attacks\n- Community and advice\n\n**Costs:**\n- Create alliance: 1,000 FXU (VIP: 500 FXU)\n- Rename alliance: 500 FXU (VIP: 250 FXU)\n\n**How to join:**\n1. Go to Alliance section\n2. Find an active one\n3. Send application and introduce yourself\n\n**Note:** Resource transport is ONLY to your own colonies, not to allies.\n\n${getRandomItem(tipsEn)} Without alliance you're easy prey!`;
}

function generateFallbackResponse(message: string, userContext: UserContext | null): string {
  const lang = detectLanguage(message);
  const lowerMessage = message.toLowerCase();
  const name = userContext?.username || '';

  const patterns = {
    analyze: /analy|analiza|account|cuenta|status|estado|empire|imperio|review|revisa|como voy|how am i/i,
    build: /build|construir|next|siguiente|should i|que debo|recomienda|comenzar|upgrade|mejorar|edificio|building/i,
    fleet: /fleet|flota|ship|nave|attack|ataque|combat|combate|raid|raideo/i,
    research: /research|investigar|technology|tecnologia|prioritize|priorizar|tech|ciencia/i,
    defense: /defense|defensa|protect|proteger|turret|torreta|shield|escudo|dome|cupula/i,
    expedition: /expedition|expedicion|explore|explorar|slot 16/i,
    moon: /moon|luna|phalanx|jump gate|lunar/i,
    alliance: /alliance|alianza|guild|clan|join|unir|acs/i,
    wallet: /wallet|fxu|usdt|balance|saldo|deposit|deposito|withdraw|retiro|swap|intercambi/i,
    help: /help|ayuda|hola|hello|hi|hey|que puedes|what can|quien eres|who are|como funciona|how does/i,
    market: /market|mercado|trade|comercio|buy|comprar|sell|vender|fee|comision/i,
    officer: /officer|oficial|commander|comandante|admiral|almirante|engineer|ingeniero|geologist|geologo|technocrat|tecnocrata/i,
    supplyBox: /supply box|caja|suministro|box|recursos instant|comprar recursos/i,
    plus: /plus|vip|suscripcion|subscription|premium|membresia|membership|beneficio/i,
    jackpot: /jackpot|pool|pozo|expedicion pool|top 50|ranking pool|comision|destrucci/i,
    lottery: /lottery|loteria|sorteo|ticket|boleto|numeros|draw|premio|jackpot.*loteria|loteria.*jackpot/i,
    social: /social|twitter|tweet|hashtag|tarea|task|ranking social/i,
    destruction: /destrucci|destruction|ranking destruc|destroy rank/i,
    rename: /rename|renombrar|nombre.*planeta|planet.*name|nombre.*alianza|alliance.*name/i,
    credit: /credit|credito|limite.*semanal|weekly.*limit|invertir|invest/i,
    transfer: /transfer|transferir|enviar.*fxu|send.*fxu|enviar.*usdt|send.*usdt/i,
    terraform: /terraform|campos|fields|expandir.*planeta|expand.*planet/i,
    blueprint: /blueprint|plano|planos|esquema|esquemas|capital.*ship|nave.*capital|nave.*avanzada|plano.*nave/i,
    storage: /storage|almacen|almacenamiento|deposito|capacidad.*recursos|recursos.*lleno|lleno|overflow|desborda/i,
    darkMatter: /dark.matter|materia.oscura|dm\b|que.*materia|como.*materia/i,
    fleetsave: /fleetsave|salvar.*flota|flota.*salvar|guardar.*flota|flota.*segura|dormir.*flota|flota.*dormir|offline.*flota|deploy.*salvar/i,
    distance: /distancia|fuel|combustible|cuanto.*tarda|tiempo.*vuelo|vuelo.*tiempo|how.*far|how.*long.*fly/i,
    galaxy: /galaxia.*ver|galaxy.*view|espiar.*quien|quien.*atacar|inactivo|inactive.*player|objetivo|target/i,
    buildTime: /tiempo.*construc|construc.*tiempo|cuanto.*tarda.*construir|build.*time|nanite|nanotec/i,
    colony: /coloni|expand|mas.*planetas|more.*planets|astrofisica|astrophysics|colonia/i,
    espionage: /espio|spy|espiar|sonda|probe|report|reporte.*espionaje/i,
    production_pct: /porcentaje.*produccion|produccion.*porcentaje|bajar.*mina|subir.*mina|percent.*mine|mine.*percent|energia.*negativa.*soluc/i,
  };

  if (patterns.analyze.test(lowerMessage) && userContext) {
    return analyzeAccount(userContext, lang);
  }
  if (patterns.build.test(lowerMessage)) {
    return getBuildingAdvice(userContext, lang);
  }
  if (patterns.fleet.test(lowerMessage)) {
    return getFleetAdvice(userContext, lang);
  }
  if (patterns.research.test(lowerMessage)) {
    return getResearchAdvice(userContext, lang);
  }
  if (patterns.defense.test(lowerMessage)) {
    return getDefenseAdvice(userContext, lang);
  }
  if (patterns.expedition.test(lowerMessage)) {
    return getExpeditionAdvice(lang);
  }
  if (patterns.moon.test(lowerMessage)) {
    return getMoonAdvice(lang);
  }
  if (patterns.alliance.test(lowerMessage)) {
    return getAllianceAdvice(userContext, lang);
  }
  if (patterns.wallet.test(lowerMessage)) {
    return getWalletAdvice(userContext, lang);
  }
  if (patterns.market.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El mercado permite:\n\n- Vender recursos y naves por FXU\n- Comprar de otros jugadores\n\n**Comisiones segun ranking:**\n- Top 50: 10% | Top 100: 15% | Top 200: 25% | Resto: 30%\n- **VIP: 7.5%** (el mas bajo!)\n\n**Limites semanales:**\n- Sin credito: limite de unidades = tus puntos de ranking\n- Con credito FXU (inversores): sin limite de unidades\n- **VIP: ilimitado!**\n\n**Cooldown:** Nuevas ofertas deben esperar 5 minutos antes de poder comprarse.\n\n${getRandomItem(tipsEs)} Invierte en VIP para la comision mas baja y sin limites!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The market allows:\n\n- Sell resources and ships for FXU\n- Buy from other players\n\n**Fees by ranking:**\n- Top 50: 10% | Top 100: 15% | Top 200: 25% | Others: 30%\n- **VIP: 7.5%** (the lowest!)\n\n**Weekly limits:**\n- No credit: unit limit = your ranking points\n- With FXU credit (investors): no unit limit\n- **VIP: unlimited!**\n\n**Cooldown:** New listings must wait 5 minutes before they can be purchased.\n\n${getRandomItem(tipsEn)} Invest in VIP for the lowest fee and no limits!`;
  }
  if (patterns.officer.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Los oficiales disponibles:\n\n**Comandante:** +2 slots de construccion, +2 slots de investigacion\n**Almirante:** +2 slots de flota, +10% velocidad de vuelo\n**Ingeniero:** +10% produccion de energia, -50% perdidas de defensas en combate\n**Geologo:** +10% produccion de minas (+20% con VIP!)\n**Tecnocrata:** +2 niveles de espionaje, -25% tiempo de investigacion\n**Androide (IA):** Oficial avanzado de IA — solo se compra con **FXU** (no Materia Oscura)\n\n${getRandomItem(tipsEs)} Los oficiales se acumulan con VIP: Geologo+VIP = +20% produccion total!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Available officers:\n\n**Commander:** +2 building queue slots, +2 research queue slots\n**Admiral:** +2 fleet slots, +10% flight speed\n**Engineer:** +10% energy production, -50% defense losses in combat\n**Geologist:** +10% mine production (+20% stacked with VIP!)\n**Technocrat:** +2 espionage levels, -25% research time\n**Android (AI):** Advanced AI officer — purchased exclusively with **FXU** (not Dark Matter)\n\n${getRandomItem(tipsEn)} Officers stack with VIP: Geologist+VIP = +20% total mine production!`;
  }
  if (patterns.supplyBox.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Las Cajas de Suministro te dan recursos instantaneos:\n\n**Cajas disponibles:**\n- **Caja Inicial:** 10k/10k/10k - 50,000 FXU\n- **Caja Media:** 50k/50k/50k - 200,000 FXU\n- **Caja Grande:** 100k/100k/100k - 350,000 FXU\n- **Caja Premium:** 250k/250k/250k - 800,000 FXU\n- **Caja Ultimate:** 500k/500k/500k - 1,550,000 FXU\n\n**Mejor valor:** Caja Ultimate (310 recursos por FXU)\n\n${getRandomItem(tipsEs)} Los recursos van directo a tu planeta, limitados por tu almacenamiento!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Supply Boxes give you instant resources:\n\n**Available boxes:**\n- **Starter Box:** 10k/10k/10k - 50,000 FXU\n- **Medium Box:** 50k/50k/50k - 200,000 FXU\n- **Large Box:** 100k/100k/100k - 350,000 FXU\n- **Premium Box:** 250k/250k/250k - 800,000 FXU\n- **Ultimate Box:** 500k/500k/500k - 1,550,000 FXU\n\n**Best value:** Ultimate Box (310 resources per FXU)\n\n${getRandomItem(tipsEn)} Resources go directly to your planet, limited by storage!`;
  }
  if (patterns.plus.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! VIP es la membresia premium con MUCHOS beneficios:\n\n**Planes disponibles:**\n- **VIP Semanal:** 40,000 FXU o $4 USDT (7 dias) - Nuevo!\n- **VIP Mensual:** 100,000 FXU o $10 USDT (1 mes)\n- **VIP Semestral:** 500,000 FXU o $50 USDT (6 meses)\n- **VIP Anual:** 1,000,000 FXU o $100 USDT (12 meses)\n\n**16 Beneficios VIP:**\n1. Comision de mercado reducida al 7.5% (en vez de 10-30%)\n2. 50% descuento completar edificios/investigaciones al instante\n3. 25% descuento completar astillero al instante\n4. 50% descuento abandonar colonias\n5. Distribucion mensual del pool\n6. Notificaciones Telegram (ataques, espionaje, batallas)\n7. +10% produccion recursos (acumulable con Geologo = +20%)\n8. -10% tiempo construccion\n9. -10% tiempo investigacion (acumulable con Tecnocrata)\n10. -10% tiempo de vuelo (acumulable con Almirante)\n11. Mercado SIN limites semanales\n12. 50% descuento boletos loteria\n13. 50% descuento renombrar planetas\n14. 50% descuento crear/renombrar alianzas\n15. 25% descuento aceleracion de flotas\n16. Credito FXU a 130% de lo invertido\n\n${getRandomItem(tipsEs)} El plan semanal de $4 es perfecto para probar los beneficios VIP!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! VIP is the premium membership with TONS of benefits:\n\n**Available plans:**\n- **VIP Weekly:** 40,000 FXU or $4 USDT (7 days) - New!\n- **VIP Monthly:** 100,000 FXU or $10 USDT (1 month)\n- **VIP Semi-annual:** 500,000 FXU or $50 USDT (6 months)\n- **VIP Annual:** 1,000,000 FXU or $100 USDT (12 months)\n\n**16 VIP Benefits:**\n1. Market fee reduced to 7.5% (instead of 10-30%)\n2. 50% off instant building/research completion\n3. 25% off instant shipyard completion\n4. 50% off colony abandonment\n5. Monthly pool distribution\n6. Telegram notifications (attacks, espionage, battles)\n7. +10% resource production (stacks with Geologist = +20%)\n8. -10% construction time\n9. -10% research time (stacks with Technocrat)\n10. -10% flight time (stacks with Admiral)\n11. Market with NO weekly limits\n12. 50% off lottery tickets\n13. 50% off planet rename\n14. 50% off alliance creation/rename\n15. 25% off fleet acceleration\n16. FXU credit at 130% of investment\n\n${getRandomItem(tipsEn)} The $4 weekly plan is perfect to try VIP benefits!`;
  }
  if (patterns.jackpot.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El Jackpot se divide en 4 pools + reserva:\n\n**Pool Expediciones (10%):**\n- Se gana aleatoriamente en expediciones\n- Posibilidad de ganar el pozo completo!\n\n**Pool Mensual TOP 50 (10%):**\n- Se distribuye mensualmente a los top 50 jugadores\n- Puesto #1 recibe mayor %, #50 el menor\n\n**Pool Social / Twitter (10%):**\n- Se reparte mensualmente segun puntos de tareas en Twitter/X\n- Haz quote tweets y comentarios con #FalcoX #Xnova #ogames\n\n**Pool Destruccion (50%):**\n- Se reparte al top 10 del ranking de destruccion\n- Destruye flotas enemigas para ganar puntos!\n\n**Reserva Admin (20%):**\n- Para administracion y desarrollo del juego\n\n${getRandomItem(tipsEs)} Los fees del mercado y aceleracion de flotas alimentan el jackpot!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The Jackpot divides into 4 pools + reserve:\n\n**Expedition Pool (10%):**\n- Won randomly during expeditions\n- Chance to win the entire pool!\n\n**Monthly TOP 50 Pool (10%):**\n- Distributed monthly to top 50 players\n- Rank #1 gets highest %, #50 gets lowest\n\n**Social Pool / Twitter (10%):**\n- Distributed monthly based on Twitter/X task points\n- Do quote tweets and comments with #FalcoX #Xnova #ogames\n\n**Destruction Pool (50%):**\n- Distributed to top 10 in destruction ranking\n- Destroy enemy fleets to earn points!\n\n**Admin Reserve (20%):**\n- For game administration and development\n\n${getRandomItem(tipsEn)} Market fees and fleet acceleration feed the jackpot!`;
  }
  if (patterns.lottery.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! La Loteria Galactica:\n\n**Como funciona:**\n- Sorteo semanal cada domingo a medianoche UTC\n- Elige 4 numeros del 1 al 30 (sin repetir)\n- Costo por boleto: **100 FXU** (VIP: **50 FXU**, 50% descuento!)\n- Maximo 10 boletos por sorteo\n\n**Premios:**\n- 4 aciertos = **JACKPOT** (todo el pozo acumulado!)\n- 3 aciertos = 1,000 FXU\n- 2 aciertos = 500 FXU\n\n**Distribucion de ventas:** 70% pozo de premios, 20% admin, 10% jackpot pools\n\n${getRandomItem(tipsEs)} Si nadie gana el jackpot, se acumula y puede crecer mucho!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The Galactic Lottery:\n\n**How it works:**\n- Weekly draw every Sunday at midnight UTC\n- Pick 4 numbers from 1-30 (no repeats)\n- Ticket cost: **100 FXU** (VIP: **50 FXU**, 50% off!)\n- Max 10 tickets per draw\n\n**Prizes:**\n- 4 matches = **JACKPOT** (entire accumulated pool!)\n- 3 matches = 1,000 FXU\n- 2 matches = 500 FXU\n\n**Sales distribution:** 70% prize pool, 20% admin, 10% jackpot pools\n\n${getRandomItem(tipsEn)} If nobody wins the jackpot, it accumulates and can grow huge!`;
  }
  if (patterns.social.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El Ranking Social (Twitter/X):\n\n**Como participar:**\n1. Vincula tu cuenta de Twitter/X (+20 FXU de recompensa!)\n2. Aparecen misiones con tweets oficiales del juego\n3. Haz quote tweets y comentarios con los hashtags\n\n**Hashtags requeridos:** #FalcoX #Xnova #ogames\n\n**Puntos:**\n- Quote tweet: +10 puntos\n- Comentario: +5 puntos\n\n**Premio:** El Pool Social (10% del jackpot) se distribuye mensualmente segun tus puntos. Mayor rango = MUCHO mas recompensa (distribucion exponencial)!\n\n${getRandomItem(tipsEs)} Es dinero gratis por tuitear - no te lo pierdas!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The Social Ranking (Twitter/X):\n\n**How to participate:**\n1. Link your Twitter/X account (+20 FXU reward!)\n2. Official tweet missions appear\n3. Do quote tweets and comments with hashtags\n\n**Required hashtags:** #FalcoX #Xnova #ogames\n\n**Points:**\n- Quote tweet: +10 points\n- Comment: +5 points\n\n**Prize:** The Social Pool (10% of jackpot) is distributed monthly based on your points. Higher rank = MUCH more reward (exponential distribution)!\n\n${getRandomItem(tipsEn)} It's free money for tweeting - don't miss out!`;
  }
  if (patterns.destruction.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El Ranking de Destruccion:\n\n**Como funciona:**\n- Cada nave enemiga que destruyes en combate te da puntos\n- Puntos = (costo_metal + costo_cristal) / 1000 de las naves destruidas\n\n**Premio:** El Pool de Destruccion (50% del jackpot!) se reparte al TOP 10:\n1. 25% | 2. 18% | 3. 14% | 4. 11% | 5. 9%\n6. 7% | 7. 6% | 8. 5% | 9. 3% | 10. 2%\n\n${getRandomItem(tipsEs)} Es el pool mas grande del jackpot - ataca y destruye para ganar!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The Destruction Ranking:\n\n**How it works:**\n- Every enemy ship you destroy in combat gives you points\n- Points = (metal_cost + crystal_cost) / 1000 of destroyed ships\n\n**Prize:** The Destruction Pool (50% of jackpot!) goes to TOP 10:\n1. 25% | 2. 18% | 3. 14% | 4. 11% | 5. 9%\n6. 7% | 7. 6% | 8. 5% | 9. 3% | 10. 2%\n\n${getRandomItem(tipsEn)} It's the biggest jackpot pool - attack and destroy to win!`;
  }
  if (patterns.rename.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Costos de renombrar:\n\n- **Primera vez** renombrar planeta: **GRATIS**\n- Renombrar planeta (despues): **100 FXU** (VIP: 50 FXU)\n- Renombrar alianza: **500 FXU** (VIP: 250 FXU)\n- Crear alianza: **1,000 FXU** (VIP: 500 FXU)\n\n${getRandomItem(tipsEs)} Con VIP tienes 50% de descuento en todos los renombramientos!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Rename costs:\n\n- **First time** planet rename: **FREE**\n- Planet rename (after): **100 FXU** (VIP: 50 FXU)\n- Alliance rename: **500 FXU** (VIP: 250 FXU)\n- Alliance creation: **1,000 FXU** (VIP: 500 FXU)\n\n${getRandomItem(tipsEn)} VIP gives you 50% off all renames!`;
  }
  if (patterns.credit.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El Sistema de Credito FXU:\n\n**Concepto:** Cuando inviertes FXU en el juego (VIP, oficiales, completar al instante, cajas), recibes **130% de credito** sobre lo gastado.\n\n**Con credito:**\n- Sin limite de unidades en el mercado\n- Puedes vender hasta el valor de tu credito restante\n- El credito se reduce conforme ganas FXU por ventas\n\n**Sin credito:**\n- Limite semanal de unidades = tus puntos de ranking\n- Limite mas restrictivo\n\n**NO generan credito:** Aceleracion de flotas, fees de mercado, fees de swap, transferencias, retiros\n\n${getRandomItem(tipsEs)} Invertir en VIP te da credito para vender mucho mas en el mercado!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The FXU Credit System:\n\n**Concept:** When you invest FXU in the game (VIP, officers, instant completions, boxes), you receive **130% credit** on what you spent.\n\n**With credit:**\n- No unit limit on market\n- Can sell up to your remaining credit value\n- Credit decreases as you earn FXU from sales\n\n**Without credit:**\n- Weekly unit limit = your ranking points\n- More restrictive limit\n\n**Don't generate credit:** Fleet acceleration, market fees, swap fees, transfers, withdrawals\n\n${getRandomItem(tipsEn)} Investing in VIP gives you credit to sell much more on the market!`;
  }
  if (patterns.transfer.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Transferencias internas:\n\n- Transfiere FXU o USDT a otros jugadores por nombre de usuario\n- **Fee: 10%** sobre el monto transferido\n- **Minimo: 1,000 FXU**\n- Ve a Wallet > Transferir para hacerlo\n\n${getRandomItem(tipsEs)} Util para ayudar a aliados o hacer negocios entre jugadores!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Internal transfers:\n\n- Transfer FXU or USDT to other players by username\n- **Fee: 10%** on transferred amount\n- **Minimum: 1,000 FXU**\n- Go to Wallet > Transfer to do it\n\n${getRandomItem(tipsEn)} Useful for helping allies or doing player-to-player deals!`;
  }
  if (patterns.terraform.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El Terraformer:\n\n**Formula (exponencial):** FLOOR(5 x POWER(nivel, 1.3)) campos extra\n\n**Campos por nivel:**\n- Nv1: 5 | Nv2: 12 | Nv3: 19 | Nv5: 40\n- Nv10: 99 | Nv15: 170 | Nv20: 256 extra campos\n\n**Requisitos:** Nanotecnologia + Energia suficiente\n\n${getRandomItem(tipsEs)} Los campos crecen exponencialmente - cada nivel vale mas que el anterior!`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! The Terraformer:\n\n**Formula (exponential):** FLOOR(5 x POWER(level, 1.3)) extra fields\n\n**Fields per level:**\n- Lv1: 5 | Lv2: 12 | Lv3: 19 | Lv5: 40\n- Lv10: 99 | Lv15: 170 | Lv20: 256 extra fields\n\n**Requirements:** Nanotechnology + enough Energy\n\n${getRandomItem(tipsEn)} Fields grow exponentially - each level is worth more than the last!`;
  }
  if (patterns.blueprint.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Los **Planos de Naves (Blueprints)**:\n\n**Que son?**\nCiertas naves avanzadas/capitales requieren un Plano para ser construidas. Sin el plano, NO puedes construirlas aunque tengas todos los recursos y edificios.\n\n**Ventaja clave:** Con el plano requerido, solo necesitas Hangar Nv1 (se omiten los requisitos normales de edificios).\n\n**Como obtener planos?**\n- **Expediciones:** La forma principal! Enviando flotas a expediciones hay posibilidad de encontrar planos. Hay un cooldown global entre drops de planos.\n- **Tienda/Eventos especiales:** Algunos planos pueden comprarse directamente\n- **Planos Miticos:** Raros, con mecanicas de drop especiales\n\n**Como funcionan?**\n- Cada plano es para un tipo de nave especifico\n- Puedes necesitar varios planos del mismo tipo\n- Al construir la nave, el plano se consume\n- Revisa tu Inventario/Planos para ver cuales tienes\n- En el Astillero, las naves con requisito de plano muestran un indicador\n\n${getRandomItem(tipsEs)} Para farmear planos: envia flotas grandes en expediciones! A mayor calidad de flota, mayores probabilidades.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! **Ship Blueprints**:\n\n**What are they?**\nCertain advanced/capital ships require a Blueprint to be built. Without the blueprint, you CANNOT build them even with all resources and buildings.\n\n**Key advantage:** With the required blueprint, you only need Hangar Lv1 (normal building requirements are bypassed).\n\n**How to get blueprints?**\n- **Expeditions:** The main way! Fleets sent on expeditions have a chance to find blueprints. There's a global cooldown between blueprint drops.\n- **Shop/Special Events:** Some blueprints can be purchased directly\n- **Mythic Blueprints:** Rare, with special drop mechanics\n\n**How do they work?**\n- Each blueprint is for a specific ship type\n- You may need multiple blueprints of the same type\n- Blueprint is consumed when you build the ship\n- Check your Inventory/Blueprints to see what you own\n- In the Shipyard, ships requiring blueprints show an indicator\n\n${getRandomItem(tipsEn)} To farm blueprints: send large quality fleets on expeditions! Higher fleet quality = better chances!`;
  }
  if (patterns.storage.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! El almacenamiento define tu limite de recursos por planeta.\n\n**Edificios:**\n- Almacen de Metal\n- Almacen de Cristal\n- Tanque de Deuterio\n\n**Regla clave:** si el almacen se llena, la produccion se desperdicia.\n\n**Formula de capacidad:** FLOOR(5000 × FLOOR(2.5 × e^(20×nivel/33)))\n\n${getRandomItem(tipsEs)} Si tu planeta se llena en menos de 4 horas, sube almacenes antes que minas.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Storage buildings set your per-planet resource cap.\n\n**Buildings:**\n- Metal Storage\n- Crystal Storage\n- Deuterium Tank\n\n**Key rule:** if storage is full, extra production is wasted.\n\n**Capacity formula:** FLOOR(5000 × FLOOR(2.5 × e^(20×level/33)))\n\n${getRandomItem(tipsEn)} If your planet fills in under 4 hours, upgrade storage before mines.`;
  }
  if (patterns.darkMatter.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! La Materia Oscura (DM) es moneda premium del juego.\n\n**Uso principal:** comprar oficiales por 7/30/90 dias.\n**Importante:** el Androide (IA) se compra con FXU, no con DM.\n**Como conseguir DM:** principalmente en expediciones y eventos.\n\n${getRandomItem(tipsEs)} Haz expediciones diarias para acumular DM gratis.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Dark Matter (DM) is the premium game currency.\n\n**Main use:** officer purchases for 7/30/90 days.\n**Important:** Android (AI officer) uses FXU, not DM.\n**How to get DM:** mostly from expeditions and events.\n\n${getRandomItem(tipsEn)} Run daily expeditions to farm free DM.`;
  }
  if (patterns.fleetsave.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Fleetsave = proteger tu flota cuando estas offline.\n\n**Como hacerlo bien:**\n1) Envia la flota lejos\n2) Velocidad al 10% (mas tiempo en vuelo)\n3) Usa Deploy/Transport o expedicion slot 16\n4) Que el tiempo cubra todo tu periodo offline\n\n${getRandomItem(tipsEs)} Nunca duermas con flota y recursos estacionados.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Fleetsave = protecting your fleet while offline.\n\n**Best method:**\n1) Send fleet far away\n2) Set 10% speed (longest flight)\n3) Use Deploy/Transport or expedition slot 16\n4) Make flight time cover your offline window\n\n${getRandomItem(tipsEn)} Never go offline with fleet and resources parked.`;
  }
  if (patterns.colony.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Para expandirte necesitas Astrofisica + Nave Colonizadora.\n\n**Puntos clave:**\n- La colonizadora se consume al fundar colonia\n- Astrofisica aumenta colonias y expediciones simultaneas\n- Posiciones frias (12-15) dan mejor deuterio\n\n${getRandomItem(tipsEs)} Expande temprano para multiplicar tu produccion total.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Expansion requires Astrophysics + a Colony Ship.\n\n**Key points:**\n- Colony Ship is consumed when colonizing\n- Astrophysics increases colonies and simultaneous expeditions\n- Cold slots (12-15) give better deuterium\n\n${getRandomItem(tipsEn)} Expand early to multiply total production.`;
  }
  if (patterns.espionage.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Regla de oro: **espiar antes de atacar**.\n\nMas sondas y mejor tecnologia de espionaje = mas informacion del objetivo (recursos, flota, defensas).\n\n${getRandomItem(tipsEs)} Si el reporte muestra poca defensa y mucha carga, es objetivo rentable.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Golden rule: **spy before attacking**.\n\nMore probes and higher espionage tech = better intel (resources, fleet, defenses).\n\n${getRandomItem(tipsEn)} If report shows low defense and high loot, it's a profitable target.`;
  }
  if (patterns.production_pct.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Ajusta porcentajes de minas (0%-100%) para equilibrar energia.\n\nSi energia es negativa, baja temporalmente minas o sube fuentes de energia.\n\n${getRandomItem(tipsEs)} Energia positiva = 100% eficiencia de produccion.`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! Use mine percentages (0%-100%) to balance energy.\n\nIf energy is negative, temporarily lower mine output or increase energy production.\n\n${getRandomItem(tipsEn)} Positive energy = full production efficiency.`;
  }
  if (patterns.help.test(lowerMessage)) {
    return lang === 'es'
      ? `${getRandomItem(greetingsEs)}${name ? ` ${name}` : ''}! Soy NOVA, tu asistente personal.\n\n**Preguntame sobre:**\n- "Analiza mi cuenta" - revision completa\n- "Que debo construir?" - recomendaciones\n- "Estrategia de flota" - naves y combate\n- "Que investigar?" - tecnologias\n- "Planos de naves / Blueprints" - como obtener y usar planos\n- "Oficiales" - bonus de cada oficial\n- "Como funcionan las expediciones?"\n- "Que son las lunas?"\n- "Como funciona el jackpot?" - pools y premios\n- "Que es VIP/Plus?" - membresia premium y sus 16 beneficios\n- "Loteria" - loteria galactica semanal\n- "Ranking social" - tareas de Twitter/X\n- "Ranking destruccion" - puntos por destruir flotas\n- "Cajas de suministro" - recursos instantaneos\n- "Como funciona el mercado?" - comisiones y credito FXU\n- "Como funciona el wallet/FXU?"\n- "Transferencias" - enviar FXU/USDT a otros\n\n${getRandomItem(encouragementsEs)}`
      : `${getRandomItem(greetingsEn)}${name ? ` ${name}` : ''}! I'm NOVA, your personal assistant.\n\n**Ask me about:**\n- "Analyze my account" - complete review\n- "What should I build?" - recommendations\n- "Fleet strategy" - ships and combat\n- "What to research?" - technologies\n- "Ship blueprints" - how to get and use blueprints\n- "Officers" - each officer's bonuses\n- "How do expeditions work?"\n- "What are moons?"\n- "How does jackpot work?" - pools and prizes\n- "What is VIP/Plus?" - premium membership and its 16 benefits\n- "Lottery" - weekly galactic lottery\n- "Social ranking" - Twitter/X tasks\n- "Destruction ranking" - fleet destruction points\n- "Supply boxes" - instant resources\n- "How does market work?" - fees and FXU credit\n- "How does wallet/FXU work?"\n- "Transfers" - send FXU/USDT to others\n\n${getRandomItem(encouragementsEn)}`;
  }

  if (userContext) {
    return analyzeAccount(userContext, lang);
  }

  return lang === 'es'
    ? `${getRandomItem(greetingsEs)}! Soy NOVA, tu guia en Falco-X Universo.\n\nNo puedo ver tus datos de cuenta. Asegurate de estar logueado y preguntame:\n- "Analiza mi cuenta"\n- "Que debo construir?"\n- "Estrategia de flota"\n\nEstoy aqui para ayudarte a conquistar la galaxia!`
    : `${getRandomItem(greetingsEn)}! I'm NOVA, your guide in Falco-X Universe.\n\nI can't see your account data. Make sure you're logged in and ask me:\n- "Analyze my account"\n- "What should I build?"\n- "Fleet strategy"\n\nI'm here to help you conquer the galaxy!`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const deepseekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
    const deepseekApiUrl = Deno.env.get('DEEPSEEK_API_URL') || 'https://api.deepseek.com/v1/chat/completions';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false }
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.log('[AI] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AI] Authenticated user:', user.id, user.email);

    let body: { message?: string; conversationHistory?: ChatMessage[] };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { message, conversationHistory = [] } = body;

    if (!message || typeof message !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (isRestrictedOtherPlayerRequest(message)) {
      const lang = detectLanguage(message);
      return new Response(
        JSON.stringify({ response: getRestrictedOtherPlayerResponse(lang), timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[AI] Processing message for user:', user.id, '| Email:', user.email);

    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      db: {
        schema: 'public'
      }
    });

    const { data: testProfile, error: testError } = await serviceSupabase
      .from('profiles')
      .select('id, username')
      .eq('id', user.id)
      .maybeSingle();

    console.log('[AI] Direct profile test:', testProfile ? `Found: ${testProfile.username}` : 'Not found', testError ? `Error: ${testError.message}` : '');

    let gameData: GameData = {
      buildingTypes: [],
      shipTypes: [],
      defenseTypes: [],
      technologyTypes: [],
      officerTypes: [],
      serverStats: { totalPlayers: 0, totalPlanets: 0, totalAlliances: 0, gameSpeed: 1, fleetSpeed: 1 }
    };
    let userContext: UserContext | null = null;

    try {
      console.log('[AI] Fetching game data and user context for userId:', user.id);
      [gameData, userContext] = await Promise.all([
        fetchGameData(serviceSupabase),
        fetchUserContext(serviceSupabase, user.id),
      ]);
      console.log('[AI] Data fetch complete. User context:', userContext ? 'loaded' : 'null');
      if (userContext) {
        console.log('[AI] User:', userContext.username, '| Planets:', userContext.planets.length);
      } else {
        console.log('[AI] WARNING: userContext is null for user:', user.id);
      }
    } catch (fetchError) {
      console.error('[AI] Error fetching data:', fetchError);
    }

    if (!deepseekApiKey) {
      const fallbackResponse = generateFallbackResponse(message, userContext);
      return new Response(
        JSON.stringify({ response: fallbackResponse, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = buildSystemPrompt(gameData, userContext);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-20),
      { role: 'user', content: message },
    ];

    try {
      const response = await callDeepSeekAPI(messages, deepseekApiKey, deepseekApiUrl);
      return new Response(
        JSON.stringify({ response, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (apiError) {
      console.error('API error, using fallback:', apiError);
      const fallbackResponse = generateFallbackResponse(message, userContext);
      return new Response(
        JSON.stringify({ response: fallbackResponse, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('AI Assistant error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
