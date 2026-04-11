import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getLocalePath } from "@/lib/locale";
import { AccountSettingsPanel } from "@/components/account-settings-panel";
import { BrandButton } from "@/components/brand-button";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { NavUser } from "@/components/nav-user";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: "en" | "pl" | "de" }>
}) {
  const { locale } = await params;
  const [session, tCommon] = await Promise.all([
    auth(),
    getTranslations({ locale, namespace: "common" }),
  ]);

  if (!session) {
    redirect(getLocalePath(locale, "/"));
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="mx-auto flex w-full max-w-7xl 2xl:max-w-[100rem] flex-1 flex-col">
        <Header
          leftSlot={<BrandButton />}
          rightSlot={
            <NavUser
              user={{
                name: session.user.name || tCommon("user"),
                email: session.user.email || "",
                avatar: session.user.image,
              }}
            />
          }
        />
        <main className="flex flex-1 px-6 py-8 md:px-8">
          <AccountSettingsPanel
            user={{
              name: session.user.name,
              email: session.user.email,
            }}
          />
        </main>
        <Footer
          leftSlot={
            <span>
              © {new Date().getFullYear()} zenshi. {tCommon("allRightsReserved")}
            </span>
          }
          rightSlot={
            <>
              <LanguageSwitcher />
              <ModeToggle />
            </>
          }
        />
      </div>
    </div>
  );
}
