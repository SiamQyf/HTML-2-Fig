const fs = require('fs');
const html = fs.readFileSync('sierra.html', 'utf8');
const links = html.match(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']+)?)["']/gi);
if (links) {
  links.forEach(l => {
    const match = l.match(/href=["']([^"']+)["']/);
    if (match) console.log(match[1]);
  });
}
