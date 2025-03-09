import ProfileSection from "#/app/(BasicLayout)/_components/sections/ProfileSection";
import BioSection from "#/app/(BasicLayout)/_components/sections/BioSection";
import CalendarSection from "#/app/(BasicLayout)/_components/sections/CalendarSection";

interface Props {
  publishedDates: Record<string, number>;
}

const InfoSection: React.FC<Props> = ({ publishedDates }) => {
  return (
    <>
      <ProfileSection />

      {/* 자기소개 및 캘린더 */}
      <section className="flex flex-1 flex-col gap-4">
        <BioSection />
        <CalendarSection publishedDates={publishedDates} />
      </section>
    </>
  );
};

export default InfoSection;
