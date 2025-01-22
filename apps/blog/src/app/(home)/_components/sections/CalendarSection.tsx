import Calendar from "#/app/(home)/_components/Calendar";

interface Props {
  publishedDates: Record<string, number>;
}

const CalendarSection: React.FC<Props> = ({ publishedDates }) => {
  return (
    <section className="flex flex-1 flex-col gap-4 section-style xl:flex-row">
      <Calendar publishedDates={publishedDates} />
    </section>
  );
};

export default CalendarSection;
