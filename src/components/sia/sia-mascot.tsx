import Image from "next/image";

export function SiaMascot({ className = "" }: { className?: string }) {
  return <Image className={className} src="/images/sia-mascot.png" alt="" aria-hidden="true" width={1280} height={1280} sizes="(max-width: 600px) 64px, 92px" />;
}
