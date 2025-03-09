import Image from "next/image";
import {
  AtSymbolIcon,
  DevicePhoneMobileIcon,
  FingerPrintIcon,
  LinkIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

import { ME } from "@workspace/constants";
import CustomSection from "#/app/(BasicLayout)/_components/sections/CustomSection";

/** 프로필 영역 ( 이미지 및 연락처 정보 ) */
const ProfileSection: React.FC = () => {
  return (
    <CustomSection className="flex flex-1 flex-col gap-1.5">
      <figure className="relative mx-auto aspect-square w-full max-w-56 min-w-36 overflow-hidden rounded-full">
        <Image src={ME.AVATAR_URL} alt="프로필 이미지" fill />
      </figure>
      <div className="flex items-center gap-2">
        <FingerPrintIcon className="h-6 w-6" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold">1-blue</span>
          <span className="text-sm">(박상은)</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MapPinIcon className="h-6 w-6" />
        <span>{ME.LOCATION}</span>
      </div>
      <a
        className="flex items-center gap-2 underline-offset-2 hover:underline"
        href={ME.GITHUB_URL}
        target="_blank"
        rel="noreferrer noopener"
      >
        <LinkIcon className="h-6 w-6" />
        <span>{ME.GITHUB_URL}</span>
      </a>
      <a
        href={`mailto:${ME.EMAIL}`}
        className="flex items-center gap-2 underline-offset-2 hover:underline"
      >
        <AtSymbolIcon className="h-6 w-6" />
        <span>{ME.EMAIL}</span>
      </a>
      <a
        href={`tel:${ME.PHONE}`}
        className="flex items-center gap-2 underline-offset-2 hover:underline"
      >
        <DevicePhoneMobileIcon className="h-6 w-6" />
        <span>{ME.PHONE}</span>
      </a>
    </CustomSection>
  );
};

export default ProfileSection;
