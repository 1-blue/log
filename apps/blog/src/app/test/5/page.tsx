import { Metadata, NextPage } from "next";

export const metadata: Metadata = {
  title: "Test5 400 * 400",
  description: "Test5 400 * 400",

  openGraph: {
    title: `해피폴리오 - 취업을 넘어 커리어 성장까지`,
    description: `현직자의 경험과 실무의 인사이트를 한곳에서.\n포트폴리오, 자기소개서, 실무 콘텐츠까지, 필요한 정보를 쉽게 찾고 준비하세요.`,
    images: [
      {
        url: "https://cdn-upload.openknowl.com/255/25a3f9b7-7b13-459d-9513-d9c378def31c/m-p.png",
        width: 400,
        height: 400,
      },
    ],
  },
};

const Page: NextPage = () => {
  return (
    <div className="text-4xl font-bold text-indigo-500">Test5 400 * 400</div>
  );
};

export default Page;
