import { Metadata, NextPage } from "next";

export const metadata: Metadata = {
  title: "Test1 600 * 600",
  description: "Test1 600 * 600",

  openGraph: {
    title: `해피폴리오 - 취업을 넘어 커리어 성장까지`,
    description: `현직자의 경험과 실무의 인사이트를 한곳에서.\n포트폴리오, 자기소개서, 실무 콘텐츠까지, 필요한 정보를 쉽게 찾고 준비하세요.`,
    images: [
      {
        url: "https://cdn-upload.miniintern.com/58205/631d265c-e9e7-44eb-bfaa-43027fede6f1/%EB%8D%94%EC%B1%95%ED%84%B0%EC%9D%B8%EC%A0%81%EC%84%B1%EB%8B%98%ED%91%9C%EC%A7%802.png",
        width: 600,
        height: 600,
      },
    ],
  },
};

const Page: NextPage = () => {
  return (
    <div className="text-4xl font-bold text-indigo-500">Test1 600 * 600</div>
  );
};

export default Page;
