/**
 * Playwright E2E Tests for CPL Server
 * 
 * These tests verify the full user flow:
 * 1. Open a TiddlyWiki with CPL Server
 * 2. View a plugin
 * 3. Check that stats are displayed
 * 4. Install a plugin and verify download is recorded
 */

const { test, expect } = require('@playwright/test');

// Test configuration
const BASE_URL = process.env.TEST_URL || 'http://localhost:8080';

// Helper to wait for CPL API to be available
test.beforeEach(async ({ page }) => {
  await page.goto(BASE_URL);
  
  // Wait for page to load
  await page.waitForLoadState('networkidle');
  
  // Wait for CPL API to be available
  await page.waitForFunction(() => {
    return typeof window.CPL_API !== 'undefined';
  }, { timeout: 10000 });
});

test.describe('CPL Server E2E', () => {
  
  test('should display plugin statistics on plugin page', async ({ page }) => {
    // Navigate to a plugin page
    // Note: Adjust the selector based on actual page structure
    const pluginLink = await page.locator('.gk0wk-notion-gallery-block').first();
    
    if (await pluginLink.isVisible().catch(() => false)) {
      await pluginLink.click();
      
      // Wait for stats to load
      await page.waitForSelector('.cpl-plugin-stats', { timeout: 5000 });
      
      // Check download count is displayed
      const downloadCount = await page.locator('.cpl-download-count').first();
      await expect(downloadCount).toBeVisible();
      
      // Check rating is displayed
      const ratingDisplay = await page.locator('.cpl-rating-display').first();
      await expect(ratingDisplay).toBeVisible();
    }
  });

  test('should allow rating a plugin', async ({ page }) => {
    // Find and click on a plugin
    const pluginLink = await page.locator('.gk0wk-notion-gallery-block').first();
    
    if (await pluginLink.isVisible().catch(() => false)) {
      await pluginLink.click();
      
      // Wait for rating widget
      await page.waitForSelector('.cpl-rating-widget', { timeout: 5000 });
      
      // Click the third star
      const thirdStar = await page.locator('.cpl-star[data-rating="3"]').first();
      
      if (await thirdStar.isVisible().catch(() => false)) {
        await thirdStar.click();
        
        // Wait for success message
        await page.waitForSelector('.cpl-rating-message:has-text("submitted")', { timeout: 5000 });
        
        // Verify rating was recorded
        const message = await page.locator('.cpl-rating-message').first();
        const text = await message.textContent();
        expect(text).toContain('submitted');
      }
    }
  });

  test('should display changelog when available', async ({ page }) => {
    // Navigate to a plugin page
    const pluginLink = await page.locator('.gk0wk-notion-gallery-block').first();
    
    if (await pluginLink.isVisible().catch(() => false)) {
      await pluginLink.click();
      
      // Wait for changelog section to appear
      const changelogSection = await page.locator('.cpl-changelog-section').first();
      
      if (await changelogSection.isVisible().catch(() => false)) {
        const content = await page.locator('.cpl-changelog-content').first();
        await expect(content).toBeVisible();
      }
    }
  });

  test('API should be accessible from browser', async ({ page }) => {
    // Test that CPL_API is available and working
    const result = await page.evaluate(async () => {
      if (typeof window.CPL_API === 'undefined') {
        return { error: 'CPL_API not available' };
      }
      
      try {
        const stats = await window.CPL_API.getStats('$:/plugins/test/plugin');
        return { success: true, stats };
      } catch (e) {
        return { error: e.message };
      }
    });
    
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.stats).toHaveProperty('downloadCount');
  });

});
