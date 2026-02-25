import {
  FolderOpen,
  GlobeHemisphereWest,
  ChartLineUp,
  RocketLaunch,
  Briefcase,
  Storefront,
  Code,
  MegaphoneSimple,
  CurrencyDollar,
  UsersThree,
  ShieldCheck,
  Wrench,
  Lightning,
  Database,
  House,
  Target,
  ShoppingCart,
  PuzzlePiece,
  Cloud,
  Star,
  GearSix,
  Palette,
  NewspaperClipping,
  Heartbeat,
} from "@phosphor-icons/react";

export function FolderGlyph({
  iconId,
  className,
  color,
}: {
  iconId: string;
  className?: string;
  color?: string;
}) {
  const style = color ? { color } : undefined;
  switch (iconId) {
    case "globe":
      return <GlobeHemisphereWest className={className} style={style} />;
    case "chart":
      return <ChartLineUp className={className} style={style} />;
    case "rocket":
      return <RocketLaunch className={className} style={style} />;
    case "briefcase":
      return <Briefcase className={className} style={style} />;
    case "store":
      return <Storefront className={className} style={style} />;
    case "code":
      return <Code className={className} style={style} />;
    case "megaphone":
      return <MegaphoneSimple className={className} style={style} />;
    case "money":
      return <CurrencyDollar className={className} style={style} />;
    case "users":
      return <UsersThree className={className} style={style} />;
    case "shield":
      return <ShieldCheck className={className} style={style} />;
    case "wrench":
      return <Wrench className={className} style={style} />;
    case "lightning":
      return <Lightning className={className} style={style} />;
    case "database":
      return <Database className={className} style={style} />;
    case "house":
      return <House className={className} style={style} />;
    case "target":
      return <Target className={className} style={style} />;
    case "cart":
      return <ShoppingCart className={className} style={style} />;
    case "puzzle":
      return <PuzzlePiece className={className} style={style} />;
    case "cloud":
      return <Cloud className={className} style={style} />;
    case "star":
      return <Star className={className} style={style} />;
    case "settings":
      return <GearSix className={className} style={style} />;
    case "palette":
      return <Palette className={className} style={style} />;
    case "news":
      return <NewspaperClipping className={className} style={style} />;
    case "health":
      return <Heartbeat className={className} style={style} />;
    default:
      return <FolderOpen className={className} style={style} />;
  }
}
