/**
 * [[GTC-457]] — THE EXPLAINER ON /demo: the words (founder's brief, 8 Nov 2026).
 * [[GTC-458]] — each step is its own fold-out, and the steps carry screenshots.
 *
 * A walk-through under "Try it yourself" that guides a visitor through the sample, step by step.
 * Every button and screen name quoted here was checked against the code and against the live
 * sample on 8 Nov 2026 (the Moment names in `MomentArc`, the demo helpers in `src/lib/demo/*` and
 * `src/components/demo/*`, the guest page's Yes / No / Maybe, and the Add Partner / Kid with a job /
 * Kid without a job / Add Guest buttons in Moment 1's form). Change a word on a screen and this
 * must follow.
 *
 * No price and no dollar sign in here either: the demo page shows no price (`walkthrough-batch14`
 * P2 reads the page file for one since GTC-394), and these words are drawn on it. The sample's
 * privacy line is the sample page's (W58 in `src/app/demo/new/page.tsx`, [[GTC-452]]); it is not
 * repeated here, so it can only drift in one place.
 *
 * THE SCREENSHOTS are real captures of the live sample (8 Nov 2026), cropped, in
 * `public/explainer/`. They go stale when a screen changes: retake the ones whose screen changed.
 * Each has words for a screen reader (`alt`) and a caption.
 *
 * CLIENT-SAFE: words only, no imports.
 */

/** A screenshot in `public/explainer/`. `width` and `height` are the file's own pixels. */
export interface ExplainerFigure {
  kind: 'figure';
  src: string;
  width: number;
  height: number;
  /** What the picture shows, for a screen reader. */
  alt: string;
  /** The line under it, for everyone. */
  caption: string;
}

export interface ExplainerParagraph {
  kind: 'p';
  text: string;
}

export type ExplainerBlock = ExplainerParagraph | ExplainerFigure;

export interface ExplainerStep {
  /** The small label above the title, for example "Moment 1". */
  eyebrow: string;
  /** The step's title, the words on its fold-out row. */
  heading: string;
  /** The number in the round badge. Absent, the badge shows a start mark. */
  badge?: string;
  /** What opens under the title, in order. */
  blocks: readonly ExplainerBlock[];
}

export const EXPLAINER_WORDS = {
  /** The heading above the fold-outs. */
  TITLE: 'How Gather works, step by step',
  /** The paragraph under it, always showing. */
  INTRO:
    'This is a working copy of Gather with a sample event for you to play with. You’re the host, the person who ends up organising everything. Gather is your assistant, so you don’t have to do the chasing. It works in four steps, which we call Moments. Tap a step to open it.',
} as const;

const p = (text: string): ExplainerParagraph => ({ kind: 'p', text });

export const EXPLAINER_STEPS: readonly ExplainerStep[] = [
  {
    eyebrow: 'Getting started',
    heading: 'Start your event',
    blocks: [
      p(
        'Press “Try it yourself” and you’ll land on a short form. The event’s name, date and venue are yours to change. Your name, email and phone are filled in for you, because the sample uses a made-up host. If your event runs over more than one day, use the link under the date. Press “Create” and your sample opens.'
      ),
    ],
  },
  {
    eyebrow: 'Moment 1',
    heading: 'Who’s coming?',
    badge: '1',
    blocks: [
      p(
        'Add the people you’re inviting, one household at a time: start with the main contact, then anyone else in that household. Someone coming on their own is a household of one. All Gather needs is a name and how to reach each person.'
      ),
      p(
        'Under the name and contact boxes, four buttons add the rest of the household: “Add Partner”, “Kid with a job”, “Kid without a job” and “Add Guest”.'
      ),
      {
        kind: 'figure',
        src: '/explainer/m1-add-buttons.jpg',
        width: 530,
        height: 222,
        alt: 'The question “Anyone else in your household?” with four buttons under it: Add Partner, Kid with a job, Kid without a job and Add Guest.',
        caption: 'Each button adds one more person to the household you’re filling in.',
      },
      p(
        'Once your own household is in, “Add a crowd” fills the list with 30 made-up people in 11 households, so you can try Gather with a full party.'
      ),
      {
        kind: 'figure',
        src: '/explainer/m1-add-crowd.jpg',
        width: 830,
        height: 594,
        alt: 'Moment 1 with the household form on the left and, on the right, a green “Add a crowd” button above a list that so far holds one household.',
        caption: '“Add a crowd” sits above the list of households, on the right.',
      },
      {
        kind: 'figure',
        src: '/explainer/m1-people-list.jpg',
        width: 540,
        height: 470,
        alt: 'A summary reading 31 people coming, in 12 households, with five people still needing contact details, each with “Add now” and “Skip for now”.',
        caption: 'After the crowd is added, Gather shows who it still can’t reach.',
      },
    ],
  },
  {
    eyebrow: 'Moment 2',
    heading: 'What’s the plan?',
    badge: '2',
    blocks: [
      p(
        'Tell Gather about the event and any dietary needs, then choose what you want covered: mains, sides, dessert and drinks. Gather uses an AI service to draft the full list of what’s needed, quantities included, and you can edit as much as you like. If you’d rather, you can write the list yourself.'
      ),
      p(
        'In the sample, “Fill in demo answers” answers the questions the way a typical host might. You can change any answer before you press “Generate plan”.'
      ),
      {
        kind: 'figure',
        src: '/explainer/m2-fill-answers.jpg',
        width: 540,
        height: 330,
        alt: 'The top of Moment 2: a green “Fill in demo answers” button, then the question “What kind of event are you planning?” with a row of event types to choose from.',
        caption: '“Fill in demo answers” is the green button at the top of Moment 2.',
      },
      {
        kind: 'figure',
        src: '/explainer/m2-answers-filled.jpg',
        width: 830,
        height: 529,
        alt: 'Moment 2 after the demo answers are filled in: “Casual BBQ” is picked, and a “What you’ve picked” table on the right lists the dietary needs, mains, sides and drinks chosen.',
        caption:
          'The answers appear in “What you’ve picked” on the right. Change any of them, then press “Generate plan”.',
      },
    ],
  },
  {
    eyebrow: 'Moment 3',
    heading: 'Who’s on what?',
    badge: '3',
    blocks: [
      p(
        'Every job gets a name against it: the potatoes, the chairs, the ice. Tap a job, then a person, to give it to them. You can see at a glance who has what and who has nothing yet. Gather can suggest who should take what, and nothing changes until you accept.'
      ),
      p(
        'When every job has an owner, “Move on” holds the plan and takes you to the last check before sending.'
      ),
    ],
  },
  {
    eyebrow: 'Moment 4',
    heading: 'Is everyone sorted?',
    badge: '4',
    blocks: [
      p(
        'In real use, Gather sends the invites and asks each person about their own job, by email, or by text if there’s no email. Nobody signs up for anything or downloads an app. Their part is a tap: Yes, No or Maybe. If someone goes quiet, Gather follows up for you and lets you know before it becomes a problem. When you come back to your laptop after a break, Gather shows you what’s changed while you were away.'
      ),
      p(
        'In this demo, nothing is actually sent. At the last check, Gather shows you what Send would have done: who would get a message, and how. Then press “See the board as it would look” to open your board.'
      ),
      p(
        'To see what a guest gets, click the “Guest view” toggle at the top of the board. It opens a guest’s own page, the one their link would open. Answer as them, then come back with “Back to the board” and watch the board change. “Make the guests reply” answers for everyone else, so you can see a board fill in.'
      ),
    ],
  },
];
