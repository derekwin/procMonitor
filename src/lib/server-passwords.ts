import 'server-only'

import { prisma } from '@/lib/prisma'
import { encryptSecret, isEncryptedSecret } from '@/lib/secrets'

export async function migrateLegacyServerPasswords() {
  const legacyServers = await prisma.server.findMany({
    where: {
      NOT: {
        password: {
          startsWith: 'enc:',
        },
      },
    },
    select: {
      id: true,
      password: true,
    },
  })

  if (legacyServers.length === 0) {
    return { migratedCount: 0 }
  }

  await prisma.$transaction(
    legacyServers.map((server) =>
      prisma.server.update({
        where: { id: server.id },
        data: {
          password: isEncryptedSecret(server.password)
            ? server.password
            : encryptSecret(server.password),
        },
      }),
    ),
  )

  return { migratedCount: legacyServers.length }
}
