import CustomSection from "#/app/(BasicLayout)/_components/sections/CustomSection";

const BioSection: React.FC = () => {
  return (
    <CustomSection className="flex flex-1 flex-col justify-center gap-4 bg-gray-200 dark:bg-gray-700/20">
      <h2 className="text-2xl font-black">프론트엔드 개발자 『박상은』</h2>
      <p>
        타입 주도 개발과 시스템 설계를 중시하는 3년차 프론트엔드 개발자
        박상은입니다.
        <br />
        저는 <b>&quot;동작하는 코드&quot;</b>보다{" "}
        <b>&quot;실수할 수 없는 코드&quot;</b>를 만드는 것이 더 중요하다고
        믿습니다.
        <br />
        이를 위해 타입 시스템을 적극 활용하여 런타임 에러를 컴파일 타임에
        방지하고, 개발자 경험(DX)을 개선하는것을 선호합니다.
      </p>
    </CustomSection>
  );
};

export default BioSection;
