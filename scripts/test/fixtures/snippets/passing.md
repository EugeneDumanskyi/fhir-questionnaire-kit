# Passing

A region:

<!-- snippet: source.txt#top -->
```ts
import { a } from 'a';
```

A region with one nested in it, dedented, its markers left out:

<!-- snippet: source.txt#nested -->
```ts
const x = 1;
const y = 2;

return x + y;
```

An HTML region, indented under a list item:

- The page:

  <!-- snippet: page.txt#embed -->
  ```html
  <script src="kit.js"></script>
  ```

A whole file:

<!-- snippet: page.txt -->
```html
<main>
  <script src="kit.js"></script>
</main>
```

A type shape:

<!-- signature -->
```ts
interface Shape { a: string }
```

Blocks that are not runnable need nothing:

```sh
pnpm lint
```

```css
.a { color: red; }
```

```
plain
```
