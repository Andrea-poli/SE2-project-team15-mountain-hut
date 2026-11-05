RETROSPECTIVE (Team 15) – Sprint 1
=====================================


- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES

### Macro statistics

- Number of stories committed vs done : 4 / 4 (MH-01, MH-02, MH-03, MH-04) 
- Total points committed vs done : 19 / 19 (8 + 5 + 3 + 3) 
- Nr of hours planned vs spent (as a team) : 80h / 80h30m 

**Remember** a story is done ONLY if it fits the Definition of Done:

- Unit Tests passing
- Code review completed
- Code present on VCS
- End-to-End tests performed

Additional DoD:

- Integration tests passing (API + real database on a temporary file)
- Manual tests performed

### Detailed statistics

| Story                      | # Tasks | Points | Hours est. | Hours actual |
|----------------------------|---------|--------|------------|--------------|
| _#0_                       | 21      | -      | 41h30m     | 42h25m       |
| MH-01 Book a table         | 10      | 8      | 15h00m     | 14h30m       |
| MH-02 Define slot capacity | 9       | 5      | 11h30m     | 12h10m       |
| MH-03 Receive confirmation | 6       | 3      | 6h00m      | 5h45m        |
| MH-04 Check availability   | 5       | 3      | 6h00m      | 5h40m        |
| **Total**                  | **51**  | **19** | **80h00m** | **80h30m**   |

> place technical tasks corresponding to story `#0` and leave out story points (not applicable in this case)
> `#0`: technical tasks without a story – M1–M3 (sprint planning, scrum meetings, retrospective meeting), U1–U10 (common base), R1–R2 (reviews of the base), C1–C6 (final checks, manual tests, demo data, demo preparation, licence, retrospective document).

- Hours per task  <span style="color:red">per person</span>  (average, standard deviation)

| Person                | Tasks | Hours est. | Hours actual | Estimate mean | Estimate StDev | Actual mean | Actual StDev |
|-----------------------|-------|------------|--------------|---------------|----------------|-------------|--------------|
| Alessandro Vallillo   | 12    | 16h00m     | 16h15m       | 1h20m         | 0h33m          | 1h21m       | 0h34m        |
| Andrea Romano         | 12    | 16h00m     | 16h10m       | 1h20m         | 0h30m          | 1h21m       | 0h35m        |
| Federico Angeloni     | 15    | 16h00m     | 15h50m       | 1h04m         | 0h24m          | 1h03m       | 0h28m        |
| Mohammad Mahdi Faraji | 12    | 16h00m     | 15h45m       | 1h20m         | 0h25m          | 1h19m       | 0h27m        |
| Yaël Vincent          | 13    | 16h00m     | 16h30m       | 1h14m         | 0h22m          | 1h16m       | 0h33m        |


How the values are computed:
- Tasks ($n$): the tasks assigned to the person, plus the shared meetings (M1, M2, M3) counted once for each person with their own time. C4 counts for both Federico Angeloni and Mohammad Mahdi Faraji (1h each)
- Mean, with $x_i$ the hours of task $i$ (estimate or actual):

  $$\bar{x} = \frac{1}{n}\sum_{i=1}^{n} x_i$$

- Standard deviation (population):

  $$\sigma = \sqrt{\frac{1}{n}\sum_{i=1}^{n} \left(x_i - \bar{x}\right)^2}$$


- Total task estimation error ratio: sum of total hours estimation / sum of total hours spent -1

  $$\frac{\sum_i estimation_{task_i}}{\sum_i spent_{task_i}} - 1 = \frac{80h00}{80h30} - 1 = \frac{4800}{4830} - 1 = -0.6\%$$


## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 5h45m
  - Total hours spent: 5h45m
  - Nr of automated unit test cases: 538 (210 server + 328 client) 
  - Coverage (if available): 100% statements, branches, functions and lines on both server and client (the mock mode and main.jsx are excluded).
- Integration testing:
  - Total hours estimated: 4h15m
  - Total hours spent: 4h50m
  - Nr of automated integration test cases: 166
- E2E testing:
  - Total hours estimated: 5h30m
  - Total hours spent: 5h50m
  - Nr of E2E test cases: 28 (each run on desktop and on a 360 px phone, 56 runs)
- Code review: 
  - Total hours estimated: 11h30m
  - Total hours spent: 11h30m


## ASSESSMENT

- What caused your errors in estimation (if any)?
  - Overall our estimates were good: as a team we spent almost exactly the hours we planned. Single tasks were less precise, but the ones that took longer and the ones that took less more or less balanced out.
  - The tasks that took longer were mainly the common parts at the start of the sprint (API contract, base backend review, auth and DAO tests). All the stories depended on them, so they were reviewed more carefully and changed more than once; the API contract also had to be updated after the PO's clarifications. The weekly slots view of MH-02 also took longer than expected, because it was the biggest page of the sprint.
  - Some tasks were faster than planned, like the table allocation logic and the MH-04 review.

- What lessons did you learn (both positive and negative) in this sprint?
  - Positive: small tasks, tests written from the agreed API contract and a different author, tester and reviewer for each piece of code gave us well-tested code. The tests helped us find some bugs, and we fixed them before the release.
  - Positive: planning the common parts at the start worked, and the stories could start without waiting for each other.
  - Negative: we did not plan when to merge each story, so they were all merged in the last days. Since some stories depended on each other, this caused conflicts and left little time for the release and the demo preparation.

- Which improvement goals set in the previous retrospective were you able to achieve? 
  - This is the first sprint of this project, so there were no goals about the code yet. On the organization side, we applied the goal of our previous project: organize the work so that nobody is blocked by someone else. During the sprint planning we reserved some time to decide together what all the stories needed in common and who would do it, and we did those parts first. After that, everyone could work on their own tasks in parallel.

- Which ones you were not able to achieve? Why?
  - None, it is the first sprint of this project.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.) 
> Propose one or two
  > - In the sprint planning, also decide when each story will be merged into dev, starting from the stories that others depend on. This way the stories reach dev one at a time during the sprint, and the last days are only for the release and the demo preparation. We will check these dates in every daily scrum.
  > - Clear up our doubts on the stories before writing the code. We will collect the first questions during the sprint planning, and then hold a short meeting in the first days of the sprint, after everyone has read the stories carefully, to gather the remaining doubts. We will open the GitHub issues for the Product Owner or the Scrum Master right after, so the answers arrive before we write the code and we do not have to change it later.

- One thing you are proud of as a Team!!
  - All four stories are done according to our Definition of Done, with full test coverage and every manual check passing. Every piece of code was written, tested and reviewed by three different people, and the workload was balanced across the team.