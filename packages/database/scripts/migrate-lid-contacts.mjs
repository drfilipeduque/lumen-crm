// Migra contatos cujo "phone" foi preenchido com um LID do WhatsApp
// (id interno de @lid, não é telefone). Detecta pelo padrão: phone com
// menos de 10 ou mais de 13 dígitos, ou que não case com formatos BR válidos.
//
// Pra cada contato suspeito:
//   - Atualiza Conversation.whatsappJid = "<phone>@lid" (no contexto da conexão)
//   - Atualiza Contact.phone = "lid:<phone>" (placeholder)
//   - Se Contact.name for só dígitos (igual ao LID), substitui por "Contato sem telefone"
//
// Idempotente: pula contatos que já estão no formato lid:<id>.

import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

function isValidBrazilianPhone(phoneDigits) {
  // 13 (55+DD+9+8) | 12 (55+DD+8) | 11 (DD+9+8) | 10 (DD+8)
  return [10, 11, 12, 13].includes(phoneDigits.length);
}

async function main() {
  const contacts = await p.contact.findMany({
    select: { id: true, name: true, phone: true },
  });

  let touched = 0;
  let skipped = 0;
  for (const c of contacts) {
    if (c.phone.startsWith('lid:')) {
      skipped++;
      continue;
    }
    const digits = c.phone.replace(/\D+/g, '');
    if (isValidBrazilianPhone(digits)) {
      skipped++;
      continue;
    }

    const lidJid = `${digits}@lid`;
    const newPhone = `lid:${digits}`;
    const isNameJustDigits = /^\d+$/.test(c.name.trim());
    const newName = isNameJustDigits ? 'Contato sem telefone' : c.name;

    // Atualiza todas as conversations desse contato pra setar o JID
    const convs = await p.conversation.findMany({
      where: { contactId: c.id },
      select: { id: true, whatsappJid: true },
    });
    for (const conv of convs) {
      if (!conv.whatsappJid) {
        await p.conversation.update({
          where: { id: conv.id },
          data: { whatsappJid: lidJid },
        });
      }
    }

    await p.contact.update({
      where: { id: c.id },
      data: { phone: newPhone, name: newName },
    });

    console.log(
      `migrated contact ${c.id} name="${c.name}" → name="${newName}" phone=${c.phone} → ${newPhone} (conv jid=${lidJid})`,
    );
    touched++;
  }

  console.log(`\ndone. migrated=${touched} skipped=${skipped}`);
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
