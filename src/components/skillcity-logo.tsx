import Image from "next/image";

export function SkillCityLogo({ size = 56 }: { size?: number }) {
  return <Image className="skillcity-logo" src="/images/aira-skillcity-logo.png" alt="" width={size} height={size} />;
}
