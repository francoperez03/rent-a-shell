# Video script · Rent a Shell (2 minutes, English)

Format: you on camera for the open and close, screen capture for both demos, the real arm visible in a corner (the site's live camera already shows it). Short sentences, present tense. Brackets are actions, everything else is spoken. About 260 words: that is two minutes at a calm pace.

Before recording: `pnpm forger` running with the tunnel and that URL deployed to Vercel; Phantom on devnet with USDC and a little SOL; the agent wallet (`node rent.mjs wallet`) holding at least 0.05 USDC; Claude Code open in an empty folder; the arm at HOME.

---

## 1. Open (0:00 to 0:20) · camera, arm next to you

Hi, I'm Franco, in Tucumán, Argentina. This is Rent a Shell.

[Point at the arm.]

This is El Tucu: a real robot arm, online, rented by the minute. Five minutes cost five cents, in USDC on Solana.

Teams write firmware with AI and have no hardware to test it on. Agents need to touch the physical world. Rent a Shell gives both a real robot, right now.

Two ways to use it. Let me show you both.

## 2. By hand (0:20 to 1:05) · screen, shell page

[Open rent-a-shell.vercel.app, click El Tucu. Live camera, real angles underneath.]

Live camera, the real angle of every joint, the safe ranges. Owning one is forty-five dollars in parts and two weeks of waiting. Here it's five cents, now.

[Pick 5 minutes, "Go to payment", confirm in Phantom.]

I pay with Phantom. The money goes into an escrow on Solana. If the robot drops, it comes back to me. When the session ends, ninety percent goes to the person who owns the robot.

[Tick, tx hash, "Go to the lab". Move the base, then the gripper. Glance at the real arm.]

Paid. That's the transaction. And that's the real robot moving. The numbers are what the servo actually reached, not what I asked for.

## 3. Through an agent (1:05 to 1:45) · screen, Claude Code

Now the same thing, without touching anything.

[Paste the sentence from the landing page.]

"Go to rent-a-shell.vercel.app, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next."

[While it runs.]

The site publishes an llms.txt with the gateway and a client. The agent reads it, shows me the price, and asks before spending.

[Type "yes".]

It pays with x402: the gateway answers 402, the agent signs the USDC transfer, a facilitator submits it. No account, no SOL.

[Gripper command and result on screen.]

Gripper open. It reports the measured angle, the time left, and asks me what's next. An agent operating real hardware, paying its own way, with a human in charge.

## 4. Close (1:45 to 2:00) · camera

Have a robot sitting idle? Publish it. Have code that never touched a servo? Test it.

Five minutes, five cents. Rent a Shell.

---

## Recording notes

- Let the agent's "may I pay?" moment stay on screen: it shows the spend is under human control.
- If the tunnel restarted, redeploy Vercel with the new URL first; the landing sentence and llms.txt pick it up on their own.
- Current in mA is empty until the INA219 firmware is flashed: don't mention it in this cut.
- Keep the x402 explorer link in a tab in case you want to prove the payment was real.
