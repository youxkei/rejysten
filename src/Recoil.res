module RecoilRoot = {
  @module("recoil") @react.component
  external make: (~children: React.element) => React.element = "RecoilRoot"
}

type atom<'a>

type selectorGetParam<'a> = {
  get: atom<'a> => 'a
}

@module("recoil") external atom: {"key": string, "default": 'a} => atom<'a> = "atom"
@module("recoil") external selector: {"key": string, "get": selectorGetParam<'a> => 'b} => atom<'b> = "selector"

@module("recoil") external useRecoilValue: atom<'a> => 'a = "useRecoilValue"
@module("recoil") external useRecoilState: atom<'a> => ('a, ('a => 'a) => unit) = "useRecoilState"
@module("recoil") external useSetRecoilState: atom<'a> => (. 'a => 'a) => unit = "useSetRecoilState"
