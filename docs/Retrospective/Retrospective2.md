RETROSPECTIVE (Team 15) – Sprint 2
=====================================


- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES

### Macro statistics

- Number of stories committed vs done : 5 / 5 (MH-05, MH-06, MH-07, MH-08, MH-09)
- Total points committed vs done : 20 / 20 (3 + 5 + 5 + 2 + 5)
- Nr of hours planned vs spent (as a team) : 80h / 81h10m

**Remember** a story is done ONLY if it fits the Definition of Done:

- Unit Tests passing
- Code review completed
- Code present on VCS
- End-to-End tests performed

Additional DoD:

- Integration tests passing (API + real database on a temporary file)
- Manual tests performed
- Pages responsive and accessible

### Detailed statistics

| Story                            | # Tasks | Points | Hours est. | Hours actual |
|----------------------------------|---------|--------|------------|--------------|
| _#0_                             | 20      | -      | 42h00m     | 40h00m       |
| MH-05 Provide party requirements | 5       | 3      | 6h30m      | 6h25m        |
| MH-06 Change a booking           | 9       | 5      | 11h00m     | 11h55m       |
| MH-07 Reserve for an hiker       | 9       | 5      | 11h00m     | 13h10m       |
| MH-08 Cancel a booking           | 5       | 2      | 3h30m      | 3h35m        |
| MH-09 Repeat a weekly schedule   | 5       | 5      | 6h00m      | 6h05m        |
| **Total**                        | **53**  | **20** | **80h00m** | **81h10m**   |

> place technical tasks corresponding to story `#0` and leave out story points (not applicable in this case)
> `#0`: technical tasks without a story – M1–M4 (sprint planning, scrum meetings, retrospective meeting, story doubts meeting), U1–U3 (API contract, migration to schema v2, demo data), D1–D4 (production build, Dockerfile, publish the image, deployment test), I1, I2, I2T (sprint 1 demo feedback: hut capacity, UI clarity and its tests), R1–R2 (reviews of `#0`), C1, C2, C4, C6 (final checks, manual tests, demo preparation, retrospective document).

- Hours per task  <span style="color:red">per person</span>  (average, standard deviation)

| Person                | Tasks | Hours est. | Hours actual | Estimate mean | Estimate StDev | Actual mean | Actual StDev |
|-----------------------|-------|------------|--------------|---------------|----------------|-------------|--------------|
| Alessandro Vallillo   | 14    | 16h45m     | 16h15m       | 1h12m         | 0h30m          | 1h10m       | 0h37m        |
| Andrea Romano         | 15    | 16h15m     | 16h05m       | 1h05m         | 0h28m          | 1h04m       | 0h28m        |
| Federico Angeloni     | 15    | 16h00m     | 16h15m       | 1h04m         | 0h23m          | 1h05m       | 0h23m        |
| Mohammad Mahdi Faraji | 13    | 16h00m     | 16h30m       | 1h14m         | 0h29m          | 1h16m       | 0h31m        |
| Yaël Vincent          | 14    | 15h00m     | 16h05m       | 1h04m         | 0h29m          | 1h09m       | 0h34m        |


How the values are computed:
- Tasks ($n$): the tasks of the person, plus the shared meetings (M1, M2, M3, M4) counted once for each person with their own time. C4 and the MH-08 code review count for both Yaël Vincent and Andrea Romano, each with half of the estimate and their own time. I2 and I2T were swapped in practice (Alessandro Vallillo added the icons, Yaël Vincent updated the tests): each counts for the person who did it and logged the time.
- Mean, with $x_i$ the hours of task $i$ (estimate or actual):

  $$\bar{x} = \frac{1}{n}\sum_{i=1}^{n} x_i$$

- Standard deviation (population):

  $$\sigma = \sqrt{\frac{1}{n}\sum_{i=1}^{n} \left(x_i - \bar{x}\right)^2}$$


- Total task estimation error ratio: sum of total hours estimation / sum of total hours spent -1

  $$\frac{\sum_i estimation_{task_i}}{\sum_i spent_{task_i}} - 1 = \frac{80h00}{81h10} - 1 = \frac{4800}{4870} - 1 = -1.4\%$$


## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 4h08m
  - Total hours spent: 3h50m
  - Nr of automated unit test cases: 988 (357 server + 631 client)
  - Coverage (if available): 100% statements, branches, functions and lines on both server and client (the mock mode and main.jsx are excluded).
- Integration testing:
  - Total hours estimated: 4h07m
  - Total hours spent: 4h05m
  - Nr of automated integration test cases: 339
- E2E testing:
  - Total hours estimated: 6h00m
  - Total hours spent: 6h40m
  - Nr of E2E test cases: 46 (each run on desktop and on a 360 px phone, 92 runs)
- Code review:
  - Total hours estimated: 9h15m
  - Total hours spent: 10h35m

> The backend test tasks of MH-05, MH-08 and MH-09 cover both unit and integration tests (3h15m estimated, 3h00m spent): their hours are split in half between the two lines. As in sprint 1, the frontend test tasks (frontend unit tests + E2E) are counted under E2E. The numbers of test cases are those of the whole project on `main` after the release.


## ASSESSMENT

- What caused your errors in estimation (if any)?
  - As a team we were close again: 81h10m spent for 80h planned (−1.4%). The stories took 3h10m more than planned and the `#0` tasks 2h less, so the two balanced out.
  - MH-07 took 2h10m more. While testing MH-07 we found that two answers of the Product Owner (PO), the password recovery by email and the forced password change for hikers created by the staff, were missing from our API contract. We added them in the middle of the sprint; that work is logged on the MH-07 frontend and test tasks, and it also made the MH-07 frontend review longer.
  - The code reviews took 10h35m instead of 9h15m, while in sprint 1 they were exact. SonarCloud started checking our pull requests on 15 November and failed some of them for duplicated code, so they needed a second round; and the PO answer on the 48-hour limit to change a booking was read in two different ways, so the code was changed and then changed back.
  - MH-09 frontend took 30 minutes more: it was rewritten after the PO answer on copying a week onto an existing schedule.
  - Some `#0` tasks took less than planned: the deployment test (30 minutes instead of 1h30, the published image worked at the first try), the hut capacity issue (the PO answer needed no change) and the UI clarity tasks, which we reduced to icons.

- What lessons did you learn (both positive and negative) in this sprint?
  - Positive: tests written from the contract by a different person found real problems before the release: a button that lost the first click after an error, the focus lost after an error in the copy week dialog, and a case that the contract did not cover (copying a week deletes the cancelled bookings of the replaced slots).
  - Positive: building the Docker image on its own branch let us test it before it reached `dev`, and building it on other machines found two problems in time: the server crashed on x86_64, and the image built on Windows did not start.
  - Positive: SonarCloud found duplicated code that we would have kept, and we moved it into shared components.
  - Negative: the stories started late. The API contract was planned for Monday 9 but was merged on Friday 13, after the PO answers of 9–12 November, and almost no time was logged on the stories before Saturday 14. 59% of the time on the stories was logged in the last three days, and all five stories reached `dev` in the last three days.
  - Negative: test tasks written before the code had to be updated and reviewed again when the code arrived.

- Which improvement goals set in the previous retrospective were you able to achieve?
  - Goal 2, clear up the doubts before writing the code, in part: we held the story doubts meeting on Tuesday 10, asked the PO about the hut capacity (answered the same day), and updated the contract with the PO answers before the code (merged on Friday 13).
  - Goal 1, a merge date for every story: the dates were set in the sprint planning and checked in the daily scrums, but they were not met (see below).

- Which ones you were not able to achieve? Why?
  - Goal 1. Planned vs actual merge into `dev`: MH-05 Thu 12 → Tue 17, MH-09 Fri 13 → Thu 19, MH-06 Mon 16 → Wed 18, MH-07 and MH-08 Tue 17 → Thu 19. Only the release was on time (`main` and the image on Thu 19). The stories started three or four days late because the contract waited for the PO answers, and when a date slipped in a daily scrum we noticed it but did not decide anything to recover it.
  - Goal 2 only in part: most PO answers came from the questions of other teams and arrived between 9 and 16 November, while we were writing the code. We missed two of them in the contract (password recovery and forced password change) and read one in two ways (the 48 hours), so some code had to change after all.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)
> Propose one or two
  > - Start every story in the first days, and finish one story before starting the next. The contract is merged on the second day with the answers we have; later PO answers update it. Each story has an owner who merges it into `dev` as soon as its tasks are approved. In every daily scrum we compare each story with its merge date, and when one is late we decide the same day who helps or what moves out.
  > - Follow the PO answers every day. One of us, in turns, reads the new PO issues each day and writes in the group which answers touch our stories. The contract and the affected tests are updated the same day, and both the developer and the tester of the task confirm that they read the answer. We will count the changes caused by a missed or misread answer (three in this sprint).

- One thing you are proud of as a Team!!
  - All five stories are done according to our Definition of Done, with 100% coverage on server and client and every manual check passing, and our first release is on Docker Hub, built for PCs and Apple-silicon Macs, and it starts by following only the README. The workload was balanced again: everyone spent between 16h05m and 16h30m.
