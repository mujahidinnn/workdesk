import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LogoMark } from "@/components/brand/Logo";
import { topoPath } from "@/lib/topo";

// Dark green backdrop drawn with gradients so the login screen ships no image.
const backdrop =
  "radial-gradient(ellipse at 20% 30%, hsl(152 60% 22% / .8), transparent 55%)," +
  "radial-gradient(ellipse at 80% 70%, hsl(160 50% 18% / .7), transparent 50%)," +
  "radial-gradient(ellipse at 60% 10%, hsl(152 45% 30% / .4), transparent 40%)";

const contour = topoPath();
const topo = (opacity: number) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 900'><path d='${contour}' fill='none' stroke='white' stroke-opacity='${opacity}' stroke-linecap='round'/></svg>`,
  )}")`;

// Page and hero panel share one viewport-fixed map, so the panel reads as a
// window onto the same terrain. The panel gets brighter lines and a green
// lift to pull focus.
const fixedBg = {
  backgroundColor: "hsl(160 20% 5%)",
  backgroundAttachment: "fixed",
  backgroundSize: "cover",
  backgroundPosition: "center",
} as const;
const pageBg = { ...fixedBg, backgroundImage: `${topo(0.05)}, ${backdrop}` };
const heroBg = {
  ...fixedBg,
  backgroundImage: `${topo(0.16)}, linear-gradient(hsl(152 60% 30% / .15), hsl(152 60% 30% / .15)), ${backdrop}`,
};

// The card keeps the reference's light palette in both themes: white panel,
// project green accent. Scoped CSS vars so the shadcn inputs and buttons follow.
const lightCard = {
  "--card": "0 0% 100%",
  "--foreground": "200 25% 10%",
  "--muted-foreground": "200 8% 45%",
  "--background": "0 0% 100%",
  "--border": "200 12% 86%",
  "--input": "200 12% 86%",
  "--accent": "190 20% 95%",
  "--accent-foreground": "200 25% 10%",
  colorScheme: "light",
} as CSSProperties;

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <div
      className="min-h-screen flex flex-col md:items-center md:justify-center md:p-8"
      style={pageBg}
    >
      {/* Mobile: brand hero on the page, form panel docks below as a sheet. */}
      <header className="md:hidden px-6 pt-10 pb-8 text-white space-y-6">
        <div className="flex items-center gap-2">
          <LogoMark className="h-7 w-auto" />
          <span className="font-bold tracking-tight">{t("app.name")}</span>
        </div>
        <h2 className="text-3xl font-extrabold uppercase leading-tight whitespace-pre-line">
          {t("login.heroTitle")}
        </h2>
        <p className="text-sm text-white/80 -mt-3">{t("login.heroBody")}</p>
      </header>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        style={lightCard}
        className="w-full max-w-5xl flex-1 md:flex-none grid md:grid-cols-2 gap-2 p-2 rounded-t-3xl md:rounded-3xl bg-card text-foreground shadow-2xl"
      >
        <aside
          className="hidden md:flex flex-col justify-between rounded-2xl p-10 min-h-[560px] text-white"
          style={heroBg}
        >
          <div className="flex items-center gap-2">
            <LogoMark className="h-7 w-auto" />
            <span className="font-bold tracking-tight">{t("app.name")}</span>
          </div>
          <div className="space-y-4">
            <h2 className="text-4xl font-extrabold uppercase leading-tight whitespace-pre-line">
              {t("login.heroTitle")}
            </h2>
            <p className="text-sm text-white/80 max-w-sm">
              {t("login.heroBody")}
            </p>
            <p className="text-sm text-white/80">{t("login.heroFoot")}</p>
          </div>
        </aside>

        <section className="relative flex items-start md:items-center justify-center px-6 pt-8 pb-14 sm:px-12 md:py-10">
          <div className="w-full max-w-sm">{children}</div>
        </section>
      </motion.div>
    </div>
  );
}
