
function ShowContact()
{
    var defpage = document.getElementById("defaultPage");
    var contact = document.getElementById("contactPage");
    var email = document.getElementById("emailvalue");

    defpage.style.display = "none";
    contact.style.display = "block";

    email.innerHTML = "brandon.hilde";
    email.innerHTML += "@icloud.com";
}

function HideContact()
{
    var defpage = document.getElementById("defaultPage");
    var contact = document.getElementById("contactPage");

    defpage.style.display = "block";
    contact.style.display = "none";
    
}