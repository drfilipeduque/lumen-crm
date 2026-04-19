import { PrismaClient, CustomFieldType, Priority, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding Lumen CRM…');

  // ---------- Users ----------
  const adminPassword = await bcrypt.hash('admin123', 10);
  const anaPassword = await bcrypt.hash('ana123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@lumen.com' },
    update: {},
    create: {
      name: 'Administrador',
      email: 'admin@lumen.com',
      password: adminPassword,
      role: UserRole.ADMIN,
      preferences: {
        theme: 'light',
        notifications: { sound: true, desktop: true, email: true },
      },
    },
  });

  const ana = await prisma.user.upsert({
    where: { email: 'ana@lumen.com' },
    update: {},
    create: {
      name: 'Ana Costa',
      email: 'ana@lumen.com',
      password: anaPassword,
      role: UserRole.COMMERCIAL,
      preferences: {
        theme: 'light',
        notifications: { sound: true, desktop: true, email: false },
      },
    },
  });

  // ---------- Pipeline + Stages ----------
  const pipeline = await prisma.pipeline.upsert({
    where: { id: 'seed-pipeline-comercial' },
    update: {},
    create: {
      id: 'seed-pipeline-comercial',
      name: 'Funil Comercial',
      description: 'Funil padrão para captação de leads de procedimentos estéticos',
      order: 0,
    },
  });

  const stagesData = [
    { id: 'seed-stage-novo',       name: 'Novo Lead',       color: '#3b82f6', order: 0 },
    { id: 'seed-stage-contato',    name: 'Contato Inicial', color: '#8b5cf6', order: 1 },
    { id: 'seed-stage-followup',   name: 'Follow-up',       color: '#f59e0b', order: 2 },
    { id: 'seed-stage-proposta',   name: 'Proposta',        color: '#06b6d4', order: 3 },
    { id: 'seed-stage-fechado',    name: 'Fechado',         color: '#22c55e', order: 4, isClosedWon:  true },
    { id: 'seed-stage-perdido',    name: 'Perdido',         color: '#ef4444', order: 5, isClosedLost: true },
  ];

  for (const s of stagesData) {
    await prisma.stage.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, pipelineId: pipeline.id },
    });
  }

  // ---------- Tags ----------
  const tagsData = [
    { name: 'Botox',         color: '#a855f7' },
    { name: 'Preenchimento', color: '#ec4899' },
    { name: 'VIP',           color: '#eab308' },
  ];
  for (const t of tagsData) {
    await prisma.tag.upsert({ where: { name: t.name }, update: {}, create: t });
  }
  const tags = await prisma.tag.findMany({ where: { name: { in: tagsData.map((t) => t.name) } } });
  const tagBy = (name: string) => tags.find((t) => t.name === name)!;

  // ---------- Custom fields ----------
  const procedimento = await prisma.customField.upsert({
    where: { id: 'seed-cf-procedimento' },
    update: {},
    create: {
      id: 'seed-cf-procedimento',
      name: 'Procedimento de Interesse',
      type: CustomFieldType.SELECT,
      options: ['Botox', 'Preenchimento Labial', 'Harmonização Facial', 'Bioestimulador', 'Limpeza de Pele'],
      required: false,
      order: 0,
    },
  });

  const valorEstimado = await prisma.customField.upsert({
    where: { id: 'seed-cf-valor' },
    update: {},
    create: {
      id: 'seed-cf-valor',
      name: 'Valor Estimado',
      type: CustomFieldType.CURRENCY,
      required: false,
      order: 1,
    },
  });

  await prisma.pipelineCustomField.upsert({
    where: { pipelineId_customFieldId: { pipelineId: pipeline.id, customFieldId: procedimento.id } },
    update: {},
    create: { pipelineId: pipeline.id, customFieldId: procedimento.id, order: 0 },
  });
  await prisma.pipelineCustomField.upsert({
    where: { pipelineId_customFieldId: { pipelineId: pipeline.id, customFieldId: valorEstimado.id } },
    update: {},
    create: { pipelineId: pipeline.id, customFieldId: valorEstimado.id, order: 1 },
  });

  // ---------- Contacts ----------
  const contactsData = [
    { name: 'Mariana Silva',    phone: '+5511999990001', email: 'mariana.silva@email.com' },
    { name: 'Juliana Pereira',  phone: '+5511999990002', email: 'juliana.pereira@email.com' },
    { name: 'Camila Rodrigues', phone: '+5511999990003', email: 'camila.rodrigues@email.com' },
    { name: 'Beatriz Almeida',  phone: '+5511999990004', email: 'bia.almeida@email.com' },
    { name: 'Patrícia Souza',   phone: '+5511999990005', email: 'paty.souza@email.com' },
  ];
  const contacts = await Promise.all(
    contactsData.map((c) =>
      prisma.contact.upsert({
        where: { phone: c.phone },
        update: {},
        create: { ...c, ownerId: ana.id },
      })
    )
  );

  // ---------- Opportunities ----------
  const oppsData = [
    {
      id: 'seed-opp-mariana',
      title: 'Botox testa — Mariana',
      value: 1200,
      priority: Priority.HIGH,
      stageId: 'seed-stage-novo',
      contactId: contacts[0].id,
      tagNames: ['Botox'],
    },
    {
      id: 'seed-opp-juliana',
      title: 'Preenchimento labial — Juliana',
      value: 1800,
      priority: Priority.MEDIUM,
      stageId: 'seed-stage-contato',
      contactId: contacts[1].id,
      tagNames: ['Preenchimento'],
    },
    {
      id: 'seed-opp-camila',
      title: 'Pacote harmonização VIP — Camila',
      value: 8500,
      priority: Priority.URGENT,
      stageId: 'seed-stage-proposta',
      contactId: contacts[2].id,
      tagNames: ['Preenchimento', 'VIP'],
    },
  ];

  for (const o of oppsData) {
    await prisma.opportunity.upsert({
      where: { id: o.id },
      update: {},
      create: {
        id: o.id,
        title: o.title,
        value: o.value,
        priority: o.priority,
        pipelineId: pipeline.id,
        stageId: o.stageId,
        contactId: o.contactId,
        ownerId: ana.id,
        tags: { connect: o.tagNames.map((n) => ({ id: tagBy(n).id })) },
        history: {
          create: { action: 'CREATED', userId: admin.id, toStageId: o.stageId },
        },
      },
    });
  }

  console.log('✅  Seed concluído.');
  console.log(`   - Users:        ${admin.email}, ${ana.email}`);
  console.log(`   - Pipeline:     ${pipeline.name} (${stagesData.length} etapas)`);
  console.log(`   - Tags:         ${tagsData.map((t) => t.name).join(', ')}`);
  console.log(`   - CustomFields: ${procedimento.name}, ${valorEstimado.name}`);
  console.log(`   - Contacts:     ${contacts.length}`);
  console.log(`   - Opportunities: ${oppsData.length}`);
}

main()
  .catch((e) => {
    console.error('❌  Seed falhou:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
