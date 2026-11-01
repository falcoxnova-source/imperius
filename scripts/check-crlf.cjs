const fs = require('fs');

const sql = fs.readFileSync('supabase/migrations/20260410100000_fix_shipyard_vip_bonus.sql', 'utf-8');

// Find the anchor text in the SQL file
const anchorStart = sql.indexOf("'/ v_game_speed");
const anchorEnd = sql.indexOf("END IF;'", anchorStart);
if (anchorStart >= 0 && anchorEnd >= 0) {
  const anchor = sql.substring(anchorStart, anchorEnd + 8);
  console.log('Anchor text in migration file:');
  console.log(JSON.stringify(anchor));
  console.log('\nCharacter codes:');
  for (let i = 0; i < anchor.length; i++) {
    const ch = anchor[i];
    const code = ch.charCodeAt(0);
    if (code === 10) console.log(`  pos ${i}: \\n (LF)`);
    else if (code === 13) console.log(`  pos ${i}: \\r (CR)`);
    else if (code < 32) console.log(`  pos ${i}: control char ${code}`);
    // else skip printable
  }
  
  // Check if CR is present
  if (anchor.includes('\r\n')) {
    console.log('\n⚠️  CRLF line endings detected in anchor text!');
    console.log('This is the problem — prosrc uses LF only.');
  } else {
    console.log('\nAnchor uses LF only — should match.');
  }
}
