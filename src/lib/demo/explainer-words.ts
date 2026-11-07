/**
 * [[GTC-457]] — THE EXPLAINER ON /demo: the words (founder's brief, 8 Nov 2026).
 *
 * A collapsed accordion under "Try it yourself" that walks a visitor through the sample, step by
 * step. Every button and screen name quoted here was checked against the code on 8 Nov 2026
 * (the Moment names in `MomentArc`, the demo helpers in `src/lib/demo/*` and `src/components/demo/*`,
 * the guest page's Yes / No / Maybe). Change a word on a screen and this must follow.
 *
 * No price and no dollar sign in here either: the demo page shows no price (`walkthrough-batch14`
 * P2 reads the page file for one since GTC-394), and these words are drawn on it. The sample's
 * privacy line is the sample page's (W58 in `src/app/demo/new/page.tsx`, [[GTC-452]]); it is not
 * repeated here, so it can only drift in one place.
 *
 * CLIENT-SAFE: words only, no imports.
 */

export interface ExplainerStep {
  /** The step's heading. */
  heading: string;
  /** One paragraph each, in order. */
  paragraphs: readonly string[];
}

export const EXPLAINER_WORDS = {
  /** The accordion's one title row. */
  TITLE: 'How Gather works, step by step',
  /** The first paragraph inside it. */
  INTRO:
    'This is a working copy of Gather with a sample event for you to play with. You’re the host, the person who ends up organising everything. Gather is your assistant, so you don’t have to do the chasing. It works in four steps, which we call Moments.',
} as const;

export const EXPLAINER_STEPS: readonly ExplainerStep[] = [
  {
    heading: 'Start your event',
    paragraphs: [
      'Press “Try it yourself” and you’ll land on a short form. The event’s name, date and venue are yours to change. Your name, email and phone are filled in for you, because the sample uses a made-up host. If your event runs over more than one day, use the link under the date. Press “Create” and your sample opens.',
    ],
  },
  {
    heading: 'Moment 1: Who’s coming?',
    paragraphs: [
      'Add the people you’re inviting, one household at a time: start with the main contact, then anyone else in that household. Someone coming on their own is a household of one. All Gather needs is a name and how to reach each person.',
      'Once your own household is in, “Add a crowd” fills the list with 30 made-up people in 11 households, so you can try Gather with a full party.',
    ],
  },
  {
    heading: 'Moment 2: What’s the plan?',
    paragraphs: [
      'Tell Gather about the event and any dietary needs, then choose what you want covered: mains, sides, dessert and drinks. Gather uses an AI service to draft the full list of what’s needed, quantities included, and you can edit as much as you like. If you’d rather, you can write the list yourself.',
      'In the sample, “Fill in demo answers” answers the questions the way a typical host might. You can change any answer before you press “Generate plan”.',
    ],
  },
  {
    heading: 'Moment 3: Who’s on what?',
    paragraphs: [
      'Every job gets a name against it: the potatoes, the chairs, the ice. Tap a job, then a person, to give it to them. You can see at a glance who has what and who has nothing yet. Gather can suggest who should take what, and nothing changes until you accept.',
      'When every job has an owner, “Move on” holds the plan and takes you to the last check before sending.',
    ],
  },
  {
    heading: 'Moment 4: Is everyone sorted?',
    paragraphs: [
      'In real use, Gather sends the invites and asks each person about their own job, by email, or by text if there’s no email. Nobody signs up for anything or downloads an app. Their part is a tap: Yes, No or Maybe. If someone goes quiet, Gather follows up for you and lets you know before it becomes a problem. When you come back to your laptop after a break, Gather shows you what’s changed while you were away.',
      'In this demo, nothing is actually sent. At the last check, Gather shows you what Send would have done: who would get a message, and how. Then press “See the board as it would look” to open your board.',
      'To see what a guest gets, click the “Guest view” toggle at the top of the board. It opens a guest’s own page, the one their link would open. Answer as them, then come back with “Back to the board” and watch the board change. “Make the guests reply” answers for everyone else, so you can see a board fill in.',
    ],
  },
];
