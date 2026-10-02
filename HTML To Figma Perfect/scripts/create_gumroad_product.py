"""
Gumroad Automated Product Creator for 'HTML To Perfect Figma PRO'
Usage:
    python scripts/create_gumroad_product.py <YOUR_GUMROAD_ACCESS_TOKEN>
"""

import sys
import json
import urllib.request
import urllib.parse
import os

DESCRIPTION = """
### Convert live webpages into fully editable, pixel-accurate native Figma layers in seconds.

**HTML To Perfect Figma** captures the live DOM, computed CSS, fonts, SVGs, and images, reconstructing them as 100% native Figma Auto-Layout frames, text layers, and vectors.

---

### 🌟 What's Included in PRO:
* 🚀 **Unlimited Webpage Imports:** No limits or restrictions.
* 🎨 **Full Auto-Layout Reconstruction:** Preserves flexbox, nested grids, gaps, padding, and alignments.
* 💎 **True Vector SVG Extraction:** Inline & embedded SVGs imported directly as clean vector bezier nodes.
* 🔤 **Typography & Web Fonts:** Automatic font-family, weight, line-height, and letter-spacing matching.
* 🖼️ **High-DPI Images & Bitmaps:** Embedded high-res images and automatic AVIF/WebP rasterization.
* ⚡ **Priority Feature Updates & Support:** Continuous engine improvements for modern web frameworks (React, Tailwind, Next.js).

---

### 📖 How to Activate:
1. Copy your unique license key sent to your email after purchase.
2. In Figma, open **Plugins** → **Development** → **HTML To Perfect Figma**.
3. Click the **PRO** badge in the top-right corner.
4. Paste your key and click **Activate**.
"""

def create_product(access_token, price_cents=1900, custom_permalink="html-to-perfect-figma"):
    url = "https://api.gumroad.com/v2/products"
    
    payload = {
        "name": "HTML To Perfect Figma PRO",
        "price": price_cents,  # in cents: 1900 = $19.00
        "description": DESCRIPTION.strip(),
        "custom_permalink": custom_permalink,
        "is_license_key_enabled": "true"
    }

    data = urllib.parse.urlencode(payload).encode("utf-8")
    
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "HTML-To-Perfect-Figma-Setup"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
            result = json.loads(body)
            if result.get("success"):
                product = result.get("product", {})
                print("\n✅ Product successfully created on Gumroad!")
                print(f"Product Name:      {product.get('name')}")
                print(f"Product URL:       {product.get('short_url')}")
                print(f"Custom Permalink:  {product.get('custom_permalink')}")
                print(f"Price:             ${price_cents / 100:.2f}")
                print(f"License Keys:      {'Enabled' if product.get('is_license_key_enabled') else 'Disabled'}")
                print("\nNext step: Open your Gumroad dashboard to review and hit 'Publish'!")
                return result
            else:
                print(f"❌ Gumroad API returned error: {result}")
                return None
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        print(f"❌ HTTP Error {e.code}: {err_body}")
        return None
    except Exception as e:
        print(f"❌ Error creating product: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
    else:
        token = input("Enter your Gumroad Access Token: ").strip()

    if not token:
        print("Error: Gumroad Access Token is required.")
        print("To get your token: Go to https://gumroad.com/settings/advanced -> Developer -> Create Application -> Generate Access Token.")
        sys.exit(1)

    create_product(token)
