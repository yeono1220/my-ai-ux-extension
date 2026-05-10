#include <unistd.h>
int main(void)
{
char name[] = "Minjae Kang";
char id[] = "2024021118";
char school[] = "Korea University";
char major[] = "Computer Science and Engineering";
syscall(462, name);
syscall(463, id);
syscall(464, school, major);
return 0;
}