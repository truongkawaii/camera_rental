const isAdmin = false;
const isSaler = true;
const isDriver = false;

if (!isAdmin && !isSaler && !isDriver) {
  console.log("FILTERED BY BRANCH");
} else {
  console.log("NOT FILTERED BY BRANCH");
}
