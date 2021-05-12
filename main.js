import fs from "fs";
import path from "path";

const OPEN_BRACES = "{";
const CLOSE_BRACES = "}";
const COMMENT_SINGLE_LINE = "//";

async function readGradleFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.resolve(filePath), (err, data) => {
      if (err) return reject(err);
      resolve(data.toString());
    });
  });
}

async function parseTokens(stringData) {
  const rows = stringData.split("\n");
  const tokens = [];
  rows.forEach((item) => {
    if (!item.length) {
      return;
    }

    const lineTokens = item.split(/\s+/g);
    tokens.push(lineTokens);
  });
  return tokens;
}

async function contructAST(tokenSet) {
  let bracketStack = [];
  const ast = {
    root: {
      type: "dict",
      name: "root",
      depth: 0,
      children: [],
    },
  };

  let objectRoot = ast.root;

  tokenSet.forEach((line) => {
    // Avoid parsing commented stuff
    if (line.join("").startsWith(COMMENT_SINGLE_LINE)) {
      return;
    }

    let parentRefStack = [ast.root];
    let values = [];
    let key = line[0];

    line.forEach((token, index, source) => {
      if (!token) {
        return;
      }
      switch (token) {
        case OPEN_BRACES: {
          bracketStack.push(OPEN_BRACES);
          if (!(objectRoot && objectRoot.children)) {
            return;
          }

          key = source[index - 1];

          objectRoot.children.push({
            type: "dict",
            name: key,
            depth: objectRoot.depth + 1,
            children: [],
            parent: objectRoot,
          });

          parentRefStack.push(objectRoot);
          objectRoot = objectRoot.children[objectRoot.children.length - 1];

          break;
        }
        case CLOSE_BRACES: {
          bracketStack.push(CLOSE_BRACES);
          objectRoot = objectRoot.parent;
          break;
        }
        default: {
          values.push(token);
        }
      }
    });

    if (values[0] && values[0] !== objectRoot.name) {
      objectRoot.children.push({
        type: "key",
        parent: objectRoot,
        depth: objectRoot.depth + 1,
        name: values[0],
        children: values.slice(1),
      });
    }
  });

  removeCircularDeps(ast.root);
  const resultJSON = formatAST(ast.root) || {};
  return resultJSON;
  // return ast.root;
}

function removeCircularDeps(ast) {
  if (!ast.children) {
    return;
  }
  ast.children.forEach((item) => {
    delete item.parent;
    removeCircularDeps(item);
  });
}

function formatAST(ast, done = false, result = {}, point = null) {
  const clone = JSON.parse(JSON.stringify(ast));
  point = point || result;

  if (done) {
    return result;
  }

  if (!(clone && clone.children)) {
    return result;
  }

  clone.children.forEach((nodeItem) => {
    if (nodeItem.type == "key") {
      if (!point[nodeItem.name] || !Array.isArray(point[nodeItem.name])) {
        point[nodeItem.name] = [];
      }
      let value = nodeItem.children.join(" ").trim();
      if (!value) {
        point[nodeItem.name] = null;
      } else {
        point[nodeItem.name].push(value.replace(/\"|'/g, ""));
      }
    } else if (nodeItem.type == "dict") {
      if (!point[nodeItem.name]) {
        point[nodeItem.name] = {};
      }
      let localPoint = point[nodeItem.name];
      formatAST(nodeItem, done, result, localPoint);
    }
  });

  return result;
}

async function main() {
  const simpleNested = await testFile("./test/gradle-files/simple-nest.gradle");
  const normalFile = await testFile("./test/gradle-files/test.gradle");
  const complexFile = await testFile("./test/gradle-files/complex.gradle");
  fs.writeFileSync(
    "./test/output/simple.json",
    JSON.stringify(simpleNested, null, 2)
  );
  fs.writeFileSync(
    "./test/output/test.json",
    JSON.stringify(normalFile, null, 2)
  );
  fs.writeFileSync(
    "./test/output/complex.json",
    JSON.stringify(complexFile, null, 2)
  );
}

async function testFile(filePath) {
  const fileContent = await readGradleFile(filePath);
  const tokens = await parseTokens(fileContent);
  const result = await contructAST(tokens);
  return result;
}

main();
