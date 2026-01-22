import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';

/**
 * GET /api/templates/[id]
 *
 * Get template details.
 * SECURITY: Verifies ownership before returning template data
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SECURITY: Fetch only ownership fields before authorization check
  const templateCheck = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
    select: { hostId: true, templateSource: true },
  });

  if (!templateCheck) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // SECURITY: Verify ownership for host templates before fetching full data
  if (templateCheck.templateSource === 'HOST' && templateCheck.hostId !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Authorization passed - fetch full template
  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
  });

  return NextResponse.json({ template });
}

/**
 * DELETE /api/templates/[id]
 *
 * Delete template (host templates only).
 * SECURITY: Verifies ownership before deletion to prevent authorization bypass
 */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // SECURITY: Fetch only ownership fields before authorization check
  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
    select: { hostId: true, templateSource: true },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // SECURITY: Verify ownership before deletion
  if (template.hostId !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // SECURITY: Prevent deletion of curated templates
  if (template.templateSource === 'GATHER_CURATED') {
    return NextResponse.json({ error: 'Cannot delete Gather curated templates' }, { status: 403 });
  }

  await prisma.structureTemplate.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ message: 'Template deleted successfully' });
}
