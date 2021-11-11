open Belt

@react.component
let make = (~bullet=?, ~item=?, ~child=?, ~isSelectedItem=false, ~itemRef=?, ()) => {
  let bullet = bullet->Option.getWithDefault(React.null)
  let item = item->Option.getWithDefault(React.null)
  let child = child->Option.getWithDefault(React.null)

  let itemClassName = if isSelectedItem {
    Style.BulletList.selectedItem
  } else {
    Style.BulletList.item
  }

  let itemDiv = switch itemRef {
  | Some(itemRef) => <div className=itemClassName ref=itemRef> {item} </div>
  | None => <div className=itemClassName> {item} </div>
  }

  <div className=Style.BulletList.container>
    <div className=Style.BulletList.bullet> {bullet} </div>
    {itemDiv}
    <div className=Style.BulletList.child> {child} </div>
  </div>
}
