import Calendar from "#/app/(BasicLayout)/_components/Calendar";
import CustomSection from "#/app/(BasicLayout)/_components/sections/CustomSection";

interface Props {
  publishedDates: Record<string, number>;
}

const CalendarSection: React.FC<Props> = ({ publishedDates }) => {
  return (
    <CustomSection className="flex flex-1 flex-col gap-4 xl:flex-row">
      <Calendar publishedDates={publishedDates} />
    </CustomSection>
  );
};

export default CalendarSection;
