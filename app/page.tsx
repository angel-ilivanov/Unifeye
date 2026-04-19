import CampusCopilotDashboard, {
  type CampusCopilotPayload,
} from "../components/campus-copilot-dashboard";

const demoPayload: CampusCopilotPayload = {
  taskName: "Workspace overview for the active study cycle",
  execution_results: {
    zulip_status: {
      status: "complete",
      subscribed: ["IN0001 Introduction to Informatics"],
    },
    zulip_channels: [
      {
        name: "IN0002 Fundamentals of Programming",
        priority: "do_now",
      },
      {
        name: "IN0015 Discrete Structures",
        priority: "schedule",
      },
    ],
    artemis_courses: [
      {
        course_name: "Complete IN0002 Assignment 3",
        priority: "do_now",
        search_url: "https://artemis.example.com/courses/in0002/assignments/3",
      },
      {
        course_name: "Complete IN0015 Assignment 2",
        priority: "do_now",
        search_url: "https://artemis.example.com/courses/in0015/assignments/2",
      },
    ],
    tumonline_courses: [
      {
        course_name: "Review IN0002 lecture slides: ch.2 Assembler Programming",
        priority: "schedule",
        search_url: "https://campus.tum.de/tumonline/course-materials",
      },
      {
        course_name: "Summarize IN0004 chapter 1 Number Systems",
        priority: "schedule",
        search_url: "https://campus.tum.de/tumonline/course-notes",
      },
    ],
    artemis_link: {
      links: [
        {
          course_name: "Complete IN0002 Assignment 3",
          priority: "do_now",
          search_url: "https://artemis.example.com/courses/in0002/assignments/3",
        },
        {
          course_name: "Complete IN0015 Assignment 2",
          priority: "do_now",
          search_url: "https://artemis.example.com/courses/in0015/assignments/2",
        },
      ],
    },
    tumonline_course_link: {
      links: [
        {
          course_name: "Review IN0002 lecture slides: ch.2 Assembler Programming",
          priority: "schedule",
          search_url: "https://campus.tum.de/tumonline/course-materials",
        },
        {
          course_name: "Summarize IN0004 chapter 1 Number Systems",
          priority: "schedule",
          search_url: "https://campus.tum.de/tumonline/course-notes",
        },
      ],
    },
    tumonline_exam_link: {
      links: [
        {
          exam_name: "Register for Number Systems midterm",
          priority: "do_now",
          search_url: "https://campus.tum.de/tumonline/exam-search",
        },
      ],
    },
  },
};

export default function HomePage() {
  return <CampusCopilotDashboard initialPayload={demoPayload} />;
}
