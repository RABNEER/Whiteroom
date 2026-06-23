import sys
import time
import os
from playwright.sync_api import sync_playwright

# Artifacts directory to save screenshots
ARTIFACTS_DIR = r"C:\Users\LOQ\.gemini\antigravity-ide\brain\aaa0ff14-0110-43eb-aaaf-63a6c2ec7295"

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Log console outputs and page errors
        page.on("console", lambda msg: print(f"Browser Console: [{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: print(f"Browser Page Error: {err.message}"))
        
        print("Navigating to auth page...")
        page.goto("http://localhost:8081/auth")
        page.wait_for_load_state("networkidle")
        
        # Wait a bit for components
        page.wait_for_timeout(4000)
        
        # Take initial screenshot
        page.screenshot(path=os.path.join(ARTIFACTS_DIR, "01_auth_loaded.png"))
        
        # Click SKIP on onboarding slides if visible
        skip_btn = page.locator("text=SKIP")
        if skip_btn.is_visible():
            print("Clicking SKIP button on welcome slides...")
            skip_btn.click()
            page.wait_for_timeout(1000)
        
        # Fill phone number
        print("Entering phone number...")
        phone_input = page.locator("input[placeholder='98765 43210']")
        phone_input.fill("9999993333")
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(ARTIFACTS_DIR, "02_phone_filled.png"))
        
        # Click verify button
        print("Clicking verify via WhatsApp...")
        verify_btn = page.locator("text=VERIFY VIA WHATSAPP (1-TAP)")
        verify_btn.click()
        
        # Wait for poll step to load and automatically resolve
        print("Waiting for WhatsApp polling step and redirect...")
        page.wait_for_timeout(8000)
        page.screenshot(path=os.path.join(ARTIFACTS_DIR, "03_polling_or_consent.png"))
        
        # Wait for consent page or dashboard redirect
        print("Current URL:", page.url)
        
        # Check if we are on consent screen
        consent_header = page.locator("text=Your data, your rights")
        if "consent" in page.url or consent_header.is_visible():
            print("On Consent screen. Checking consent checkbox...")
            # Click the checkbox text/element to agree
            page.locator("text=I understand and agree to Whiteroom's data practices").click()
            page.wait_for_timeout(1000)
            
            print("Clicking Accept...")
            accept_btn = page.locator("text=I AGREE & CONTINUE")
            accept_btn.click()
            page.wait_for_timeout(3000)
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, "04_consent_accepted.png"))
            print("Current URL:", page.url)
            
        # Check if we are on Role Select
        role_header = page.locator("text=Choose your role")
        if "role" in page.url or role_header.is_visible():
            print("On Role Select screen. Selecting School Admin...")
            page.locator("text=School Admin").click()
            page.wait_for_timeout(1000)
            
            # Fill school name
            page.locator("input[placeholder='e.g. Verma Physics Classes']").fill("Admin Test School")
            page.wait_for_timeout(500)
            
            # Click complete button
            page.locator("text=CREATE INSTITUTION").click()
            page.wait_for_timeout(5000)
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, "05_onboarding_completed.png"))
            print("Current URL:", page.url)
            
        # Try to navigate directly to /teacher if we are redirecting
        if "/chat" in page.url:
            print("Redirected to /chat. Navigating to /teacher...")
            page.goto("http://localhost:8081/teacher")
            page.wait_for_timeout(4000)
            page.screenshot(path=os.path.join(ARTIFACTS_DIR, "06_teacher_dashboard.png"))
            
        # Now try to create a classroom!
        print("Current URL on dashboard:", page.url)
        if "/teacher" in page.url:
            # Click CLASSES tab if not active
            classes_tab = page.locator("text=Classes")
            if classes_tab.is_visible():
                classes_tab.click()
                page.wait_for_timeout(1500)
                page.screenshot(path=os.path.join(ARTIFACTS_DIR, "06b_classes_tab.png"))
            
            new_class_btn = page.locator("text=New Classroom")
            if new_class_btn.is_visible():
                print("Clicking 'New Classroom'...")
                new_class_btn.click()
                page.wait_for_timeout(1500)
                page.screenshot(path=os.path.join(ARTIFACTS_DIR, "07_class_modal_opened.png"))
                
                # Fill name
                print("Filling classroom name...")
                page.locator("input[placeholder='e.g. Class 11 – Batch B']").fill("Grade 10 Biology")
                page.locator("input[placeholder='e.g. Physics']").fill("Biology")
                page.wait_for_timeout(1000)
                
                # Click Create
                print("Clicking 'Create'...")
                page.locator("button:has-text('Create')").click()
                page.wait_for_timeout(5000)
                page.screenshot(path=os.path.join(ARTIFACTS_DIR, "08_class_created_result.png"))
                print("Final URL:", page.url)
            else:
                print("New Classroom button not found.")
                
        browser.close()

if __name__ == "__main__":
    run()
