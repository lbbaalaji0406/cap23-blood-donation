fetch('http://127.0.0.1:9000/masters/blood_group.json?ns=cap23-blood-donation-default-rtdb')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
