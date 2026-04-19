import CampusCopilotDashboard, {
  type CampusCopilotPayload,
} from "../components/campus-copilot-dashboard";

const demoPayload: CampusCopilotPayload = {
  taskName: "Autonomous academic orchestration for the upcoming study cycle",
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
        course_name: "Review IN0015 tutorial material",
        priority: "schedule",
        search_url: "https://artemis.example.com/courses/in0015/materials",
      },
    ],
    tumonline_courses: [
      {
        course_name: "Enroll in Computer Architecture",
        priority: "schedule",
        search_url: "https://campus.tum.de/tumonline/course-search",
      },
      {
        course_name: "Enroll in Institutional Systems Lab",
        priority: "do_now",
        search_url: "https://campus.tum.de/tumonline/lab-search",
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
          course_name: "Review IN0015 tutorial material",
          priority: "schedule",
          search_url: "https://artemis.example.com/courses/in0015/materials",
        },
      ],
    },
    tumonline_course_link: {
      links: [
        {
          course_name: "Enroll in Computer Architecture",
          priority: "schedule",
          search_url: "https://campus.tum.de/tumonline/course-search",
        },
        {
          course_name: "Enroll in Institutional Systems Lab",
          priority: "do_now",
          search_url: "https://campus.tum.de/tumonline/lab-search",
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
