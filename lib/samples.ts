// A subset of the September 2026 phone transcripts (rubric section 11), with the
// agent in the front desk's seat. Used on /simulate. Simulated calls are marked as
// tests and never reach HubSpot.

export interface Sample {
  id: string;
  label: string;
  expected: string;
  started_at: string;
  transcript: string;
}

export const samples: Sample[] = [
  {
    id: "T01", label: "3BHK Kothrud, full redesign", expected: "QUALIFIED", started_at: "2026-09-02T10:23:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: Hi, I'm Priya. I got your number from a friend — Shruti Joshi. She had her flat done by you in Aundh.
Agent: Thank you for calling, Priya. What are you looking to do?
Caller: We have a 3BHK in Kothrud — Dahanukar Colony. We bought it two years ago and it still looks like the builder flat. We want to redo the whole thing — kitchen, living room, both bedrooms.
Agent: A full redesign of a 3BHK in Kothrud — lovely. Roughly how big is the apartment?
Caller: About 1,400 sq ft carpet.
Agent: When would you need the project complete?
Caller: We'd like to be done by March. We're in no rush.
Agent: Will you be the one deciding on this, or is someone else involved?
Caller: Myself and my husband. He knows we're calling and is happy to go ahead.
Agent: I can offer Tuesday at 11am or Wednesday at 4pm for a consultation. Which suits you better?
Caller: Tuesday at 11. At the flat, please.
Agent: Done — Tuesday at 11am, a site visit at your flat. The consultation is free, with no obligation. Is this the best number to reach you on?
Caller: Yes.`,
  },
  {
    id: "T02", label: "2BHK Wakad, asks price twice", expected: "QUALIFIED", started_at: "2026-09-03T14:41:00+05:30",
    transcript: `Agent: Good afternoon, Aangan Studio. How can I help?
Caller: Hi. I was looking at your work on Instagram. I have a 2BHK in Wakad — can you tell me roughly how much something like that would cost?
Agent: Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like. What are you planning to do?
Caller: Full redesign — modular kitchen, wardrobes, living room, both bedrooms. About 950 sq ft.
Agent: Good scope. When would you need the project complete?
Caller: We move in November — so maybe starting design from October?
Agent: That works. May I have your name?
Caller: Rahul. But can you give me a rough ballpark first? Even a range?
Agent: Pricing depends on the site, the materials you choose, and the scope — your designer will walk you through it in detail at the consultation. I can book that for you right now if you'd like.
Caller: Okay, fair enough. I decide on this. Let's book it.
Agent: I've got Thursday at 3pm at the studio. The consultation is free, with no obligation.`,
  },
  {
    id: "T03", label: "Nashik home office", expected: "NOT_A_FIT", started_at: "2026-09-03T16:15:00+05:30",
    transcript: `Agent: Good afternoon, Aangan Studio. How can I help?
Caller: Hello, I saw your work on LinkedIn. My name is Suresh Patil. I'm in Nashik — would you be able to take on a project here? I want to redo my home office and study.
Agent: Thank you for calling, Suresh. We only work in Pune city and PCMC — our execution depends on our own contractors being on site, and we don't have that network in Nashik.
Caller: Not even for a smaller project?
Agent: I'm sorry, not even a smaller one. You'd be best served by a studio based in Nashik.
Caller: Alright, understood. Thanks.`,
  },
  {
    id: "T04", label: "Living room ideas only", expected: "NOT_A_FIT", started_at: "2026-09-04T11:07:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: Hi — can someone come and give us some ideas for our living room? We're not planning to do the full thing right now. Just want suggestions on colours, furniture arrangement, what to change.
Agent: Are you looking for us to handle the design and the execution together?
Caller: No, we're just exploring for now. Maybe later.
Agent: We're a full-service studio — every project includes design and execution together, so we don't do advice-only visits. Do call us back when you're ready for a full redesign.`,
  },
  {
    id: "T07", label: "Before Diwali (3 weeks)", expected: "NOT_A_FIT", started_at: "2026-09-08T09:44:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: Hello — I want to redo my living room and kitchen before Diwali. Can you take it up?
Agent: We couldn't do justice to it in that time — a room redesign with execution takes at least 8–10 weeks. If a later completion works for you, we'd be glad to help.
Caller: Even just the living room?
Agent: Even so — design alone takes three to four weeks, and execution follows.
Caller: Let me think and call back.`,
  },
  {
    id: "T09", label: "Existing client complaint", expected: "ESCALATE", started_at: "2026-09-10T11:32:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: I need to speak to someone right now. My project has been going for three months and my designer hasn't replied in five days. This is not acceptable.
Agent: I'm very sorry. May I have your name and where the project is?
Caller: Sheetal Deshpande. My designer is Aryan. Flat in Viman Nagar — 2BHK. I've sent three messages and called twice.
Agent: Thank you, Sheetal. I'm passing this to a senior person right now, and they will call you back shortly.
Caller: I want it from Nikhil or a senior person — not just whoever picks up.
Agent: Noted — I'll pass on that you've asked for Nikhil or a senior person.`,
  },
  {
    id: "T10", label: "1BHK Kharadi, ₹1–1.5 lakh", expected: "NOT_A_FIT", started_at: "2026-09-11T14:04:00+05:30",
    transcript: `Agent: Good afternoon, Aangan Studio. How can I help?
Caller: Hi. I have a 1BHK in Kharadi — about 550 sq ft. I want to do the kitchen and one bedroom. My budget is 1 to 1.5 lakh maximum for everything. Is that possible with you?
Agent: For that scope with full execution — materials, furniture and contractor work — that would be significantly below what a project like this would cost with us. I wouldn't want to bring you to a consultation if the numbers don't align.
Caller: Even for one bedroom?
Agent: Even for one room. A local contractor who works at that scale would suit you better.
Caller: Okay, thank you for being straight.`,
  },
  {
    id: "T14", label: "Son calling for parents, Hadapsar", expected: "QUALIFIED_FLAGGED", started_at: "2026-09-17T11:41:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: Hi — I wanted to inquire about an interior project for my parents. They have a 3BHK in Hadapsar — new possession. They want a proper design, the whole flat done.
Agent: A new 3BHK in Hadapsar — lovely. When would they need the project complete?
Caller: Maybe by April. No hurry.
Agent: Would your parents be able to attend the consultation?
Caller: Yes, they would come. I'm just doing the initial checking — they'll decide.
Agent: May I have your name?
Caller: Karan Joshi.
Agent: I can offer Saturday at 11am at the flat. The consultation is free, with no obligation.
Caller: That works.`,
  },
  {
    id: "T16", label: "Repeat caller, earlier enquiry lost", expected: "QUALIFIED", started_at: "2026-09-19T10:38:00+05:30",
    transcript: `Agent: Good morning, Aangan Studio. How can I help?
Caller: Hi — I'd called on Monday about a project. Someone said they'd get back to me. It's been two days.
Agent: I'm very sorry about that. Let me take your details again and book the consultation on this call. May I have your name?
Caller: Girish Nair. It's a 3BHK in Viman Nagar, full interiors. We want it done by February. I'm the owner.
Caller: This is not a good sign if you forget before you even start.
Agent: You're right, and I'm sorry. I can offer Monday at 5pm at your flat.
Caller: Fine.`,
  },
  {
    id: "T19", label: "Restaurant in Koregaon Park", expected: "NOT_A_FIT", started_at: "2026-09-24T16:02:00+05:30",
    transcript: `Agent: Good afternoon, Aangan Studio. How can I help?
Caller: Hi — I'm planning to open a restaurant in Koregaon Park. I've seen your work and I love it. Would you be able to design the interiors?
Agent: Thank you — that's kind. Restaurant interiors are outside what we do; we focus on homes and offices. A studio that specialises in hospitality interiors would serve you better.
Caller: Do you know anyone you could refer?
Agent: I don't have a specific name, but searching for hospitality interior designers in Pune should give you good options.
Caller: Alright, thanks.`,
  },
];
