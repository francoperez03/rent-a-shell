# Video script · Rent a Shell (2 minutes, English)

Format: you on camera for the open and close, screen capture for both demos, the real arm visible in a corner (the site's live camera already shows it). Short sentences, present tense, questions that the demo answers. Brackets are actions, everything else is spoken. About 280 words: two minutes at a calm pace.

Before recording: `pnpm forger` running with the tunnel and that URL deployed to Vercel; Phantom on devnet with USDC and a little SOL; the agent wallet (`node rent.mjs wallet`) holding at least 0.05 USDC; Claude Code open in an empty folder; the arm at HOME.

---

## 1. Open (0:00 to 0:20) · camera, arm next to you

Your AI agent writes robot code all day. But it has never touched a real robot. What if it could rent one? Five minutes. Five cents. Move the arm, watch the camera, and then ask you what to do next.

[Point at the arm.]

I'm Franco from Tucumán, and this is El Tucu. That is exactly what it does. A real robot, paid by the minute, in USDC on Solana. For small teams that build with AI, and for the agents they build.

Two ways to use it. Let me show you both.

## 2. By hand (0:20 to 1:05) · screen, shell page

What does five cents buy you?

[Open rent-a-shell.vercel.app, click El Tucu. Live camera, real angles underneath.]

This. A live camera, the real angle of every joint, and the safe limits. If you want to own one, you pay forty-five dollars in parts and wait two weeks. Here it is five cents, right now.

[Pick 5 minutes, "Go to payment", confirm in Phantom.]

Who keeps the money? A program on Solana. If the robot fails, the money comes back to me. When my time ends, ninety percent goes to the owner of the robot. We call them Forgers: makers and labs that publish hardware nobody is using, and get paid for every minute. One command runs the gateway next to the robot. Anyone can be one.

[Tick, tx hash, "Go to the lab". Move the base, then the gripper. Glance at the real arm.]

Paid. This is the transaction. And this is the real robot moving. The numbers show where the servo really is.

## 3. Through an agent (1:05 to 1:45) · screen, Claude Code

Now, can an agent do all of this by itself?

[Paste the sentence from the landing page.]

"Go to rent-a-shell.vercel.app, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next."

[While it runs.]

It reads the site, finds the robot, and before it spends any money, it shows me the price and asks.

[Type "yes".]

Then it pays with x402: the server asks for payment, the agent signs the USDC transfer, and a facilitator sends it. No account, no SOL, no form.

[Gripper command and result on screen.]

The gripper is open. It tells me the real angle, the time left, and asks what I want next. An agent using real hardware, paying for itself, with a human in control.

## 4. Close (1:45 to 2:00) · camera

So, can your agent rent a robot? Now it can.

Do you have a robot that nobody uses? Become a Forger and publish it. Do you have code that never ran on a real servo? Test it.

Five minutes, five cents. Rent a Shell.

---

## Recording notes

- Let the agent's "may I pay?" moment stay on screen: it answers the question the open asked.
- If the tunnel restarted, redeploy Vercel with the new URL first; the landing sentence and llms.txt pick it up on their own.
- Current in mA is empty until the INA219 firmware is flashed: don't mention it in this cut.
- Keep the x402 explorer link in a tab in case you want to prove the payment was real.
