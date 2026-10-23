"""
Task 6 - Selenium WebDriver test for TaskBoard.

Install:  pip install -r requirements.txt     (Chrome must be installed)
Run:      python test_taskboard.py http://YOUR-ALB-DNS-NAME
          python test_taskboard.py http://localhost        (local test)
Headless: set HEADLESS=1   (e.g. when running on a server without a screen)

Selenium 4 downloads the matching ChromeDriver automatically (Selenium Manager).
"""
import os
import sys
import time
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

APP_URL = (sys.argv.pop(1) if len(sys.argv) > 1 else os.getenv("APP_URL", "http://localhost")).rstrip("/")
SHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")


class TaskBoardTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        opts = Options()
        if os.getenv("HEADLESS") == "1":
            opts.add_argument("--headless=new")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument("--window-size=1280,900")
        cls.driver = webdriver.Chrome(options=opts)
        cls.wait = WebDriverWait(cls.driver, 15)
        os.makedirs(SHOT_DIR, exist_ok=True)
        print(f"\nTesting: {APP_URL}")

    @classmethod
    def tearDownClass(cls):
        cls.driver.quit()

    def setUp(self):
        self.driver.get(APP_URL)

    def test_1_page_title(self):
        """Page loads and has the correct <title>"""
        self.assertIn("TaskBoard", self.driver.title)

    def test_2_heading_element(self):
        """Verify a web element: the main <h1> heading"""
        heading = self.wait.until(EC.visibility_of_element_located((By.ID, "app-title")))
        self.assertEqual(heading.text, "TaskBoard")

    def test_3_served_by_instance(self):
        """App reports which EC2 instance served the page (load balancer proof)"""
        badge = self.driver.find_element(By.ID, "instance-id")
        self.wait.until(lambda d: "loading" not in badge.text)
        print(f"   {badge.text}")
        self.assertTrue(badge.text.startswith("Served by:"))

    def test_4_database_connected(self):
        """Front-end reports the DB container is reachable"""
        status = self.driver.find_element(By.ID, "db-status")
        self.wait.until(lambda d: "checking" not in status.text)
        self.assertEqual(status.text, "DB: connected")

    def test_5_add_task_end_to_end(self):
        """Full flow: type a task, submit, verify it appears (browser -> API -> MongoDB)"""
        title = f"Selenium task {int(time.time())}"
        box = self.wait.until(EC.element_to_be_clickable((By.ID, "task-input")))
        box.send_keys(title)
        self.driver.find_element(By.ID, "add-btn").click()

        self.wait.until(EC.text_to_be_present_in_element((By.ID, "task-list"), title))
        titles = [e.text for e in self.driver.find_elements(By.CSS_SELECTOR, "#task-list .task-title")]
        self.assertIn(title, titles)
        self.driver.save_screenshot(os.path.join(SHOT_DIR, "task_added.png"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
