# Gather Prototype

A coordination app for multi-day gatherings (Christmas, reunions, retreats) that ensures everyone knows what they're responsible for without anyone holding the whole plan in their head.

## Project Status

This is a working prototype built to the specifications in `gather-builder-spec-v1.3.3.md`.

## The Job To Be Done

> Make sure everyone knows what they're responsible for, without anyone having to hold the whole plan in their head.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** SQLite via Prisma
- **Styling:** Tailwind CSS
- **Auth:** Magic links (token-based)
- **Hosting:** Local development

## Getting Started

See the full specification in `gather-builder-spec-v1.3.3.md` for complete implementation details.

## Key Features

- **Role-based access** via magic links (Host, Coordinator, Participant)
- **Team-based coordination** with clear ownership
- **Workflow states** (Draft → Confirming → Frozen → Complete)
- **Critical item tracking** with freeze gates
- **Real Christmas 2025 data** (Richardson Family Christmas)

## Documentation

- Full specification: `gather-builder-spec-v1.3.3.md`
- Includes schema, API routes, seed data, and acceptance criteria
- Version 1.3.3 (December 2025)

## What This Is NOT

- A recipe app
- A shopping list manager
- A budget tracker
- A seating planner
- A group chat
- A project management tool
