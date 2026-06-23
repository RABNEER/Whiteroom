"""
Full E2E test: Login → Onboard → Create Classroom → Add Students
Tests against local dev server (localhost:3000 API + localhost:8081 Metro web)
"""
import os
import sys
from playwright.sync_api import sync_playwright

ARTIFACTS = r"C:\Users\LOQ\.gemini\antigravity-ide\brain\aaa0ff14-0110-43eb-aaaf-63a6c2ec7295"
PHONE = "9999998888"  # Fresh number to avoid conflicts

def screenshot(page, name):
    path = os.path.join(ARTIFACTS, f"e2e_{name}.png")
    page.screenshot(path=path)
    print(f"  📸 {name}")

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 420, "height": 800})
        page = context.new_page()

        errors = []
        page.on("console", lambda m: None)  # suppress console noise
        page.on("pageerror", lambda e: errors.append(str(e)))

        page.goto("http://localhost:8081/auth", wait_until="domcontentloaded")
        page.wait_for_timeout(5000)
        screenshot(page, "01_auth_navigated")

        # ── STEP 2: Skip welcome ──
        print("⏭️  STEP 2: Skipping welcome slides...")
        # Check if SKIP button is visible, if so click it (can also search case-insensitive / text=skip)
        skip = page.locator("text=SKIP")
        if skip.is_visible():
            skip.click()
            page.wait_for_timeout(1000)
        
        # Wait for the phone input selector
        page.wait_for_selector("input[placeholder='98765 43210']", timeout=15000)
        page.wait_for_timeout(2000)
        screenshot(page, "01_auth")

        # ── STEP 3: Enter phone ──
        print(f"📱 STEP 3: Entering phone {PHONE}...")
        page.locator("input[placeholder='98765 43210']").fill(PHONE)
        page.wait_for_timeout(500)
        screenshot(page, "02_phone")

        # ── STEP 4: WhatsApp verify (dev bypass) ──
        print("✅ STEP 4: Starting WhatsApp verification...")
        page.locator("text=VERIFY VIA WHATSAPP (1-TAP)").click()
        page.wait_for_timeout(10000)  # Wait for dev bypass polling
        screenshot(page, "03_post_verify")
        print(f"   URL: {page.url}")

        # ── STEP 5: Consent ──
        consent = page.locator("text=Your data, your rights")
        if consent.is_visible():
            print("📋 STEP 5: Accepting consent...")
            page.locator("text=I understand and agree").click()
            page.wait_for_timeout(500)
            page.locator("text=I AGREE & CONTINUE").click()
            page.wait_for_timeout(2000)
            screenshot(page, "04_consent_done")
            print(f"   URL: {page.url}")
        else:
            print("📋 STEP 5: Consent screen not shown (skipped)")

        # ── STEP 6: Role select ──
        role_header = page.locator("text=How will you use Whiteroom")
        if role_header.is_visible():
            print("👤 STEP 6: Selecting role (School Admin)...")
            # School Admin should be pre-selected
            school_input = page.locator("input[placeholder='e.g. Greenfield High School']")
            if school_input.is_visible():
                school_input.fill("E2E Test Academy")
                page.wait_for_timeout(500)
            create_inst = page.locator("text=CREATE INSTITUTION")
            if create_inst.is_visible():
                create_inst.click()
                page.wait_for_timeout(5000)
            screenshot(page, "05_role_done")
            print(f"   URL: {page.url}")
        else:
            print("👤 STEP 6: Role select not shown (skipped)")

        # ── STEP 7: Tenant init (if redirected) ──
        page.wait_for_timeout(2000)
        tenant_init = page.locator("text=Initialize Your")
        if tenant_init.is_visible():
            print("🏫 STEP 7: Completing tenant initialization...")
            name_input = page.locator("input[placeholder='e.g. Verma Physics Classes']")
            if name_input.is_visible():
                name_input.fill("E2E Test Academy")
            page.locator("text=COMPLETE INITIALIZATION").click()
            page.wait_for_timeout(5000)
            screenshot(page, "06_tenant_init")
            print(f"   URL: {page.url}")
        else:
            print("🏫 STEP 7: Tenant init not shown (skipped)")

        # ── Navigate to teacher dashboard if needed ──
        if "/teacher" not in page.url:
            print("   Navigating to /teacher...")
            page.goto("http://localhost:8081/teacher")
            page.wait_for_timeout(4000)

        screenshot(page, "07_dashboard")
        print(f"📊 Dashboard URL: {page.url}")

        # ── STEP 8: Click CLASSES tab ──
        print("📚 STEP 8: Clicking CLASSES tab...")
        classes_nav = page.locator("text=Classes").last
        classes_nav.click()
        page.wait_for_timeout(2000)
        screenshot(page, "08_classes_tab")

        # ── STEP 9: Create classroom ──
        print("🏫 STEP 9: Creating classroom 'Grade 10 Science'...")
        new_class = page.locator("text=New Classroom")
        if new_class.is_visible():
            new_class.click()
            page.wait_for_timeout(1000)

            page.locator("input[placeholder='e.g. Class 11 – Batch B']").fill("Grade 10 Science")
            page.locator("input[placeholder='e.g. Physics']").fill("Science")
            page.wait_for_timeout(500)
            screenshot(page, "09_class_form")

            # Click Create button
            create_btn = page.locator("role=button[name='CREATE']")
            if not create_btn.is_visible():
                create_btn = page.locator("text=/^CREATE$/i")
            create_btn.click()
            page.wait_for_timeout(4000)
            screenshot(page, "10_class_created")

            # Verify it appears in the list
            grade10 = page.locator("text=Grade 10 Science")
            if grade10.is_visible():
                print("   ✅ Classroom 'Grade 10 Science' created successfully!")
            else:
                print("   ❌ Classroom not visible in list!")
        else:
            print("   ❌ 'New Classroom' button not found!")

        # ── STEP 10: Enter classroom and add students ──
        print("👥 STEP 10: Entering classroom to add students...")
        grade10_card = page.locator("text=Grade 10 Science").first
        if grade10_card.is_visible():
            grade10_card.click()
            page.wait_for_timeout(2000)
            screenshot(page, "11_class_detail")

            # Click Students tab
            print("   Clicking Students tab...")
            students_tab = page.locator("text=/^Students$/")
            students_tab.click()
            page.wait_for_timeout(2000)
            screenshot(page, "12_students_tab")

            # Add first student: Aarav Sharma
            print("   Adding student 'Aarav Sharma'...")
            add_student = page.locator("text=Add Student")
            if add_student.is_visible():
                add_student.click()
                page.wait_for_timeout(1000)

                page.locator("input[placeholder='Rahul Kumar']").fill("Aarav Sharma")
                page.locator("input[placeholder='07']").fill("01")
                page.wait_for_timeout(500)
                screenshot(page, "13_student1_form")

                # Click Add button
                add_btn = page.locator("text=/^Add$/i").last
                add_btn.click()
                page.wait_for_selector("text=Aarav Sharma", timeout=10000)
                screenshot(page, "14_student1_added")
                print("   ✅ Student 'Aarav Sharma' added successfully!")

                # Add second student: Priya Patel
                print("   Adding student 'Priya Patel'...")
                add_student2 = page.locator("text=Add Student")
                if add_student2.is_visible():
                    add_student2.click()
                    page.wait_for_timeout(1000)

                    page.locator("input[placeholder='Rahul Kumar']").fill("Priya Patel")
                    page.locator("input[placeholder='07']").fill("02")
                    page.wait_for_timeout(500)

                    add_btn2 = page.locator("text=/^Add$/i").last
                    add_btn2.click()
                    page.wait_for_selector("text=Priya Patel", timeout=10000)
                    screenshot(page, "15_student2_added")
                    print("   ✅ Student 'Priya Patel' added successfully!")
                else:
                    print("   ❌ 'Add Student' button not found for 2nd student!")
            else:
                print("   ❌ 'Add Student' button not found!")
        else:
            print("   ❌ Grade 10 Science card not found to click!")

        # ── Final screenshot ──
        screenshot(page, "16_final_state")
        print(f"\n🏁 Final URL: {page.url}")

        if errors:
            print(f"\n⚠️  Page errors encountered: {len(errors)}")
            for e in errors[:5]:
                print(f"   - {e[:200]}")

        print("\n✅ E2E TEST COMPLETE")
        browser.close()

if __name__ == "__main__":
    run()
