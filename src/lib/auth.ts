import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
          // Override jwt: refresh the role from the database periodically (Node runtime) so
          // role changes (for example, becoming SUPERADMIN) apply without logout/login.
          // auth.config.ts (edge/middleware) continues using the default JWT without database access.
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.roleCheckedAt = Date.now();
        return token;
      }
      const last = token.roleCheckedAt || 0;
      if (token.id && Date.now() - last > 60_000) {
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true },
          });
          if (dbUser) token.role = dbUser.role;
          token.roleCheckedAt = Date.now();
        } catch {
          // Keep the previous role if the query fails; do not block authentication.
        }
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          
          const user = await prisma.user.findUnique({ where: { email } });
          if (!user) return null;

          const passwordsMatch = await bcrypt.compare(password, user.password);

          if (passwordsMatch) {
             return user;
          }
        }
        return null;
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
});
