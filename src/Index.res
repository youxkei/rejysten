@bs.module("firebase/app") external firebase: 'a = "default"
%%raw(`import "firebase/firestore"`)


let firebaseConfig = {
  "apiKey": "AIzaSyBibda14rl7kYHvJJPyqxXYkL-FnnbpIKk",
  "authDomain": "rejysten.firebaseapp.com",
  "databaseURL": "https://rejysten.firebaseio.com",
  "projectId": "rejysten",
  "storageBucket": "rejysten.appspot.com",
  "messagingSenderId": "720104133648",
  "appId": "1:720104133648:web:5f1f29ef3ae4916cdae695",
  "measurementId": "G-64RW992RRF"
}

firebase["initializeApp"](firebaseConfig)

module App = {
    @react.component
    let make = () => {
        <Document document={"NdxNjoPpHTuFjfhRDUth"} />
    }
}

switch ReactDOM.querySelector("#app") {
    | Some(app) => ReactDOM.render(<App />, app)
    | None => ()
}
