/**
 * Show generated items - raw DB vs UI display
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const event = await prisma.event.findFirst({
    where: { name: 'McKorbett Christmas 2025' },
    include: {
      teams: {
        include: {
          items: {
            orderBy: { name: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
  });

  if (!event) {
    console.error('Event not found');
    return;
  }

  console.log('\n📊 RAW DATABASE FIELDS FOR EACH ITEM:\n');
  console.log('='.repeat(100));

  for (const team of event.teams) {
    console.log(`\nTEAM: ${team.name}`);
    for (const item of team.items) {
      console.log(`\n  ITEM: ${item.name}`);
      console.log(`    ├─ quantityAmount: ${item.quantityAmount}`);
      console.log(`    ├─ quantityUnit: ${item.quantityUnit}`);
      console.log(`    ├─ quantityText: "${item.quantityText}"`);
      console.log(`    ├─ quantityState: ${item.quantityState}`);
      console.log(`    ├─ quantityLabel: ${item.quantityLabel}`);
      console.log(`    ├─ critical: ${item.critical}`);
      console.log(
        `    ├─ notes (quantityReasoning): "${item.notes?.substring(0, 80)}${item.notes && item.notes.length > 80 ? '...' : ''}"`
      );
      console.log(
        `    └─ dietary: veg=${item.vegetarian}, gf=${item.glutenFree}, df=${item.dairyFree}`
      );
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log('\n💻 WHAT USER SEES IN THE UI (FORMATTED DISPLAY):\n');
  console.log('='.repeat(100));

  for (const team of event.teams) {
    console.log(`\n${team.name.toUpperCase()}`);
    console.log(`"${team.scope}"\n`);

    for (const item of team.items) {
      // Display name and quantity
      let display = `  • ${item.name}`;

      // Quantity display (UI logic)
      if (item.quantityText) {
        display += ` → ${item.quantityText}`;
      } else if (item.quantityAmount && item.quantityUnit) {
        display += ` → ${item.quantityAmount} ${item.quantityUnit}`;
      } else {
        display += ' → TBD';
      }

      // Critical badge
      if (item.critical) {
        display += ' [CRITICAL]';
      }

      console.log(display);

      // Show label indicator
      if (item.quantityLabel === 'CALCULATED') {
        console.log(`      Label: ✓ Calculated (formula-based)`);
      } else if (item.quantityLabel === 'HEURISTIC') {
        console.log(`      Label: ~ Heuristic (rule of thumb)`);
      } else if (item.quantityLabel === 'PLACEHOLDER') {
        console.log(`      Label: ? Placeholder (needs input)`);
      }

      // Show dietary tags
      const tags = [];
      if (item.vegetarian) tags.push('Vegetarian');
      if (item.glutenFree) tags.push('Gluten-Free');
      if (item.dairyFree) tags.push('Dairy-Free');
      if (tags.length > 0) {
        console.log(`      Dietary: ${tags.join(', ')}`);
      }

      // Show reasoning (what the AI said)
      if (item.notes) {
        console.log(`      AI Reasoning: "${item.notes}"`);
      }

      console.log('');
    }
  }

  console.log('='.repeat(100));

  console.log('\n📈 GENERATION SUMMARY:\n');
  console.log(`  Event: ${event.name}`);
  console.log(`  Occasion: ${event.occasionType}`);
  console.log(`  Guests: ${event.guestCount}`);
  console.log(
    `  Dietary: ${event.dietaryVegetarian} vegetarian, ${event.dietaryGlutenFree} gluten-free`
  );
  console.log(
    `  Venue: ${event.venueName} (${event.venueOvenCount} ovens, BBQ: ${event.venueBbqAvailable})`
  );
  console.log(`\n  Teams generated: ${event.teams.length}`);
  console.log(
    `  Items generated: ${event.teams.reduce((sum, team) => sum + team.items.length, 0)}`
  );
  console.log(
    `  Critical items: ${event.teams.reduce((sum, team) => sum + team.items.filter((i) => i.critical).length, 0)}`
  );
  console.log(
    `  Calculated quantities: ${event.teams.reduce((sum, team) => sum + team.items.filter((i) => i.quantityLabel === 'CALCULATED').length, 0)}`
  );
  console.log(
    `  Heuristic quantities: ${event.teams.reduce((sum, team) => sum + team.items.filter((i) => i.quantityLabel === 'HEURISTIC').length, 0)}`
  );
  console.log(
    `  Placeholder quantities: ${event.teams.reduce((sum, team) => sum + team.items.filter((i) => i.quantityLabel === 'PLACEHOLDER').length, 0)}`
  );
  console.log('');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
