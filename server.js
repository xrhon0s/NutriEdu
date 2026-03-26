require("dotenv").config();
const express = require("express");
const cors = require("cors");

const userRoutes = require("./routes/userRoutes");
const recipeRoutes = require("./routes/recipeRoutes");


const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/recipes", recipeRoutes);
app.use("/api/users", userRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
 console.log("Servidor corriendo en puerto", PORT);
});