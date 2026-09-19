//creating heading
var tr = document.createElement('tr')  
tr.className="heading"
var td0 = tr.appendChild(document.createElement('td'))
var td1 = tr.appendChild(document.createElement('td'))
var td2 = tr.appendChild(document.createElement('td'))
var td3 = tr.appendChild(document.createElement('td'))
td0.textContent="ID"
td1.textContent="Name"
td2.textContent="College"
td3.textContent="Points"                
document.getElementById("tbl").appendChild(tr)

//variables and lists for fixtures
var count=0
var l=[0,1,2,3,4,5,6,7]
var points={0:0,1:0,2:0,3:0,4:0,5:0,6:0,7:0}
var names=[]
var colleges=[]
//total count for rounds is 27
var round_count=0
//code for team0 vs team2 and entering 0 or 1
var div = document.createElement('div')

var team0 = document.createElement('p')
team0.id="first team"
team0.setAttribute("onclick", "declareWinner(1)")
div.appendChild(team0)   //first team
var vs = div.appendChild(document.createElement('p'))      //vs
var team1 = document.createElement('p')
team1.id="second team"
team1.setAttribute("onclick", "declareWinner(0)")
div.appendChild(team1)   //second team
vs.textContent="VS"
vs.id="vs"

var tapHint = document.createElement('p')
tapHint.id="tap-hint"
tapHint.textContent="Tap a corner to declare the winner"

//adding each participant
function addParticipant(){
    var name=document.inputs.name.value   
    var college=document.inputs.college.value
        
    var tr = document.createElement('tr')  
    tr.className="input_table"

    //creating the td elements
    var td0 = tr.appendChild(document.createElement('td'))
    var td1 = tr.appendChild(document.createElement('td'))
    var td2 = tr.appendChild(document.createElement('td'))
    var td3 = tr.appendChild(document.createElement('td'))
 
    count++
    td0.textContent=count              //ID
    td1.textContent=name
    names.push(name)
    td2.textContent=college
    colleges.push(college)
    td3.textContent=0                  //initial points

    if (count==8) on8()

    document.getElementById("tbl").appendChild(tr)
}


function on8(){                      //after 8 values entered
    document.getElementById("one").remove()
    document.getElementById("heading").textContent = "Next Match"
 
    team0.textContent=names[l[0]]
    team1.textContent=names[l[1]]
    document.getElementById("two").appendChild(div)
    document.getElementById("two").appendChild(tapHint)
}



function change(n){
    l.push(l[n])
    l.splice(n,1)
    points[l[0]]++  
    round_count++;
    if(round_count==27){
        document.getElementById("two").remove()
        document.getElementById("heading").textContent="27 battles have been completed!"
        var h = document.createElement('h1')
        h.id="result"
        h.textContent="Top 2 teams with the highest score win"
        document.getElementById("three").appendChild(h)
    }
    if(points[l[[0]]]==7){
        document.getElementById("two").remove()
        document.getElementById("heading").textContent="Congratulations!"
        var h = document.createElement('h1')
        h.id="result"
        h.textContent=names[l[0]] +" wins"
        document.getElementById("three").appendChild(h)
    }
    else{
        document.getElementById("first team").textContent = names[l[0]]
        document.getElementById("second team").textContent = names[l[1]]
    }
}

function declareWinner(win){       //win: 1 = left team wins, 0 = right team wins
    var items = document.getElementsByClassName("input_table")
    if(win==1){
        items[l[0]].lastChild.textContent=Number(items[l[0]].lastChild.textContent)+1
    }
    else{
        items[l[1]].lastChild.textContent=Number(items[l[1]].lastChild.textContent)+1
    }
    change(win)
}