import CustomSection from "#/app/(BasicLayout)/_components/sections/CustomSection";

const BioSection: React.FC = () => {
  return (
    <CustomSection className="flex flex-1 flex-col justify-center gap-4 bg-gray-200 dark:bg-gray-700/20">
      <h2 className="text-2xl font-black">프론트엔드 개발자 『박상은』</h2>
      <p>
        TypeScript와 TailwindCss를 좋아하는 프론트엔드 개발자 박상은입니다.
        <br />
        풀스택 개발자가 되는 것을 목표로 달리고 있습니다.
      </p>
    </CustomSection>
  );
};

export default BioSection;
