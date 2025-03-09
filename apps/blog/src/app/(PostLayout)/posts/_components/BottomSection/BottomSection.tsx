import Image from "next/image";

import { ME } from "@workspace/constants";
import type { IPostWithETC } from "#/types";
import CopyLinkButton from "#/app/(PostLayout)/posts/_components/CopyLinkButton";
import ScrollTopButton from "#/app/(PostLayout)/posts/_components/ScrollTopButton";

import Tag from "#/app/_components/atoms/Tag";
import HomeLinkButton from "#/app/(PostLayout)/posts/_components/HomeLinkButton";

interface Props extends IPostWithETC {}

const ButtomSection: React.FC<Props> = ({ tags }) => {
  return (
    <article className="space-y-10">
      <ul className="flex flex-wrap gap-3 self-start text-sm font-semibold">
        {tags.map((tag) => (
          <Tag key={tag} tag={tag} />
        ))}
      </ul>

      <div className="flex justify-between">
        <div className="flex gap-3">
          <div className="avatar">
            <Image
              src={ME.AVATAR_URL}
              alt="아바타 이미지"
              width={70}
              height={70}
              className="rounded-full"
            />
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-2xl font-bold">{ME.NAME}</span>
            <p className="text-sm font-semibold">{ME.BIO}</p>
          </div>
        </div>
        <div className="flex gap-1.5 self-start">
          <HomeLinkButton />
          <CopyLinkButton />
          <ScrollTopButton />
        </div>
      </div>
    </article>
  );
};

export default ButtomSection;
