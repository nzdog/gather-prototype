import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';

/**
 * GET /api/templates/[id]
 *
 * Get template details.
 * SECURITY: Now uses session authentication instead of query param
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hostId = user.id; // Use authenticated user's ID

  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  // If it's a host template, verify ownership
  if (template.templateSource === 'HOST' && template.hostId !== hostId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json({ template });
}

/**
 * DELETE /api/templates/[id]
 *
 * Delete template (host templates only).
 * SECURITY: Now uses session authentication instead of body param
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hostId = user.id; // Use authenticated user's ID

  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id },
  });

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  if (template.hostId !== hostId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  if (template.templateSource === 'GATHER_CURATED') {
    return NextResponse.json({ error: 'Cannot delete Gather curated templates' }, { status: 403 });
  }

  await prisma.structureTemplate.delete({
    where: { id: params.id },
  });

  return NextResponse.json({ message: 'Template deleted successfully' });
}
