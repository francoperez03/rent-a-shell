# Video script · Rent a Shell (90 seconds, English)

Format: you on camera for the open and close, screen capture for both demos, the real arm visible in a corner (the site's live camera already shows it). Written to be spoken: full sentences, present tense, questions that the demo answers. Brackets are actions, everything else is spoken. About 330 words: a minute and a half at a calm pace.

Before recording: `pnpm forger` running with the tunnel and that URL deployed to Vercel; Phantom on devnet with USDC and a little SOL; the agent wallet (`node rent.mjs wallet`) holding at least 0.05 USDC; the agent's terminal open in an empty folder; the arm at HOME.

---

## 1. Open (0:00 to 0:15) · camera, arm next to you

Your AI agent writes robot code all day, but it has never touched a real robot. What if it could rent one for five minutes, for five cents?

[Point at the arm.]

I'm Franco, from Tucumán, and this is El Tucu, the first robot on Rent a Shell. It's real hardware that you pay by the minute, in USDC on Solana. It's for small teams that build with AI, and for the agents they build.

There are two ways to use it.

## 2. By hand (0:15 to 0:50) · screen, shell page

So, what do you get for five cents?

[Open rent-a-shell.vercel.app, click El Tucu. Live camera, real angles underneath.]

I open rent-a-shell.vercel.app and pick El Tucu. I get a live camera, the real angle of every joint, and the safe limits. If I wanted to own one, I'd pay forty-five dollars in parts and wait two weeks. Here I pay five cents and I'm in right now.

[Pick 5 minutes, "Go to payment", confirm in Phantom.]

Who keeps the money? A program on Solana. If the robot fails, the money comes back to me. When my time ends, ninety percent goes to the owner of the robot. We call them Forgers: makers and labs that publish hardware nobody is using. They run one command next to the robot, and that's it.

[Tick, hash, "Go to the lab". Move the base, then the gripper. Look at the real arm.]

Paid. This is the transaction, and this is the real robot moving. The numbers show where the servo really is.

## 3. Through an agent (0:50 to 1:20) · screen, the agent

Now, can an agent do all of this by itself? Let's see. I tell it:

[Paste the sentence from the landing.]

"Go to rent-a-shell.vercel.app, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next."

[While it runs.]

It reads the site, it finds the robot, and before it spends any money, it shows me the price and asks me. I say yes.

[Type "yes".]

Then it pays with x402. The server asks for payment, the agent signs the USDC transfer, and a facilitator sends it. No account, no SOL, no form to fill.

[The gripper command and its result on screen.]

And the gripper is open. It tells me the real angle, how much time is left, and asks me what I want next. That's an agent using real hardware, paying for itself, with a human in control.

## 4. Close (1:20 to 1:30) · camera

So, can your agent rent a robot? Now it can. If you have a robot that nobody uses, become a Forger and publish it. If you have code that never ran on a real servo, come and test it.

It's rent-a-shell.vercel.app. Five minutes of a real robot, for five cents.

---

## Recording notes

- Let the agent's "may I pay?" moment stay on screen: it answers the question the open asked.
- If the tunnel restarted, redeploy Vercel with the new URL first; the landing sentence and llms.txt pick it up on their own.
- Current in mA is empty until the INA219 firmware is flashed: don't mention it in this cut.
- Keep the x402 explorer link in a tab in case you want to prove the payment was real.
