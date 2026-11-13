/**
 * [snapshot 압축] aria 스냅샷 텍스트(들여쓰기 2칸 YAML 목록)를 모델이 읽기 좋게 줄인다 (spec 015 FR-2·3).
 * ① `/url: "#…"`·`/url: "javascript:…"` 줄 삭제 ② 이름·속성 없이 ref 만 있는 generic/cell 이 자식 하나면 접기
 * ③ dialog·alertdialog 하위 트리를 맨 앞으로. 문자열 → 문자열 순수 함수 — 해석하지 못하면 원문을 돌려준다.
 */

interface ITreeNode {
  text: string;
  childList: ITreeNode[];
}

/** 열린 대화상자를 앞에 실을 때 붙이는 표시 */
export const OPEN_DIALOG_MARK = '[열린 대화상자]';

const INDENT = '  ';
const NOISE_URL_PATTERN = /^- \/url: "?(#|javascript:)/;
const BARE_WRAPPER_PATTERN = /^- (generic|cell) \[ref=[^\]]+\]:$/;
const DIALOG_PATTERN = /^- (dialog|alertdialog)\b/;

/** 압축한 트리 텍스트 — 실패하면 원문 */
export function compactSnapshot(tree: string): string {
  try {
    const rootList = filterNodeList(parseTree(tree.split('\n')));
    const dialogList = rootList.flatMap(takeDialogList);
    const restList = rootList.filter((node) => !DIALOG_PATTERN.test(node.text));
    const body = serialize(restList, 0);
    if (dialogList.length === 0) return body.join('\n');
    return [OPEN_DIALOG_MARK, ...serialize(dialogList, 0), ...body].join('\n');
  } catch {
    return tree;
  }
}

/** 들여쓰기로 트리를 만든다 — 빈 줄은 버린다 */
function parseTree(lineList: string[]): ITreeNode[] {
  const rootList: ITreeNode[] = [];
  const stack: { depth: number; node: ITreeNode }[] = [];
  for (const line of lineList) {
    if (line.trim() === '') continue;
    const depth = line.length - line.trimStart().length;
    const node: ITreeNode = { text: line.trimStart(), childList: [] };
    while (stack.length > 0 && (stack.at(-1)?.depth ?? 0) >= depth) stack.pop();
    (stack.at(-1)?.node.childList ?? rootList).push(node);
    stack.push({ depth, node });
  }
  return rootList;
}

/** 잡음 줄 삭제 + 빈 껍데기 접기 (자식부터) */
function filterNodeList(nodeList: ITreeNode[]): ITreeNode[] {
  return nodeList.flatMap((node) => {
    if (NOISE_URL_PATTERN.test(node.text)) return [];
    const childList = filterNodeList(node.childList);
    const [onlyChild] = childList;
    if (BARE_WRAPPER_PATTERN.test(node.text) && childList.length === 1 && onlyChild) return [onlyChild];
    return [{ text: childList.length === 0 ? stripTrailingColon(node.text) : node.text, childList }];
  });
}

/** 자식을 모두 지운 줄의 끝 `:` — 자식이 없다는 표시로 남기지 않는다 */
function stripTrailingColon(text: string): string {
  return text.endsWith(':') ? text.slice(0, -1) : text;
}

/** 노드 안의 dialog 하위 트리를 떼어 낸다 — 찾은 dialog 는 부모의 자식 목록에서 지운다 (dialog 안 dialog 는 그대로) */
function takeDialogList(node: ITreeNode): ITreeNode[] {
  if (DIALOG_PATTERN.test(node.text)) return [node];
  const dialogList = node.childList.flatMap(takeDialogList);
  node.childList = node.childList.filter((child) => !DIALOG_PATTERN.test(child.text));
  return dialogList;
}

function serialize(nodeList: ITreeNode[], depth: number): string[] {
  return nodeList.flatMap((node) => [`${INDENT.repeat(depth)}${node.text}`, ...serialize(node.childList, depth + 1)]);
}
