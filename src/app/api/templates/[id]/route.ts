import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/templates/[id]?hostId={hostId}
 *
 * Get template details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const searchParams = request.nextUrl.searchParams;
  const hostId = searchParams.get('hostId');

  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id }
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
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const { hostId } = body;

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  const template = await prisma.structureTemplate.findUnique({
    where: { id: params.id }
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
    where: { id: params.id }
  });

  return NextResponse.json({ message: 'Template deleted successfully' });
}
